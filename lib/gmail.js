const { google } = require('googleapis');

function getBaseUrl() {
  if (process.env.APP_URL) return process.env.APP_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
}

function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${getBaseUrl()}/api/auth/callback`
  );
}

function getAuthUrl() {
  return getOAuth2Client().generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/gmail.readonly'],
    prompt: 'consent',
  });
}

async function exchangeCode(code) {
  const client = getOAuth2Client();
  const { tokens } = await client.getToken(code);
  return tokens;
}

async function getAuthedClient(tokens) {
  const client = getOAuth2Client();
  client.setCredentials(tokens);

  // Proactively refresh if expiring within 60 seconds
  if (tokens.expiry_date && tokens.expiry_date < Date.now() + 60_000) {
    const { credentials } = await client.refreshAccessToken();
    client.setCredentials(credentials);
    return { client, newTokens: credentials };
  }
  return { client, newTokens: null };
}

async function getUserEmail(tokens) {
  const { client } = await getAuthedClient(tokens);
  const gmail = google.gmail({ version: 'v1', auth: client });
  const res = await gmail.users.getProfile({ userId: 'me' });
  return res.data.emailAddress;
}

async function fetchEmails(tokens, maxResults = 50) {
  const { client, newTokens } = await getAuthedClient(tokens);
  const gmail = google.gmail({ version: 'v1', auth: client });

  const listRes = await gmail.users.messages.list({
    userId: 'me',
    labelIds: ['INBOX'],
    maxResults,
  });

  const messages = listRes.data.messages || [];
  if (!messages.length) return { emails: [], newTokens };

  const emails = [];
  for (const msg of messages) {
    try {
      const msgRes = await gmail.users.messages.get({ userId: 'me', id: msg.id, format: 'full' });
      const parsed = parseMessage(msgRes.data);
      if (parsed) emails.push(parsed);
    } catch (e) {
      console.error(`Error fetching message ${msg.id}:`, e.message);
    }
  }

  return { emails, newTokens };
}

async function fetchAttachment(tokens, emailId, attachmentId) {
  const { client } = await getAuthedClient(tokens);
  const gmail = google.gmail({ version: 'v1', auth: client });
  const res = await gmail.users.messages.attachments.get({
    userId: 'me',
    messageId: emailId,
    id: attachmentId,
  });
  const b64 = (res.data.data || '').replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(b64, 'base64');
}

// ── Parsers ──────────────────────────────────────────

function parseAddress(raw) {
  if (!raw) return { name: null, email: 'unknown@unknown.com' };
  const m = raw.match(/^(.*?)\s*<(.+?)>$/);
  if (m) return { name: m[1].replace(/"/g, '').trim() || null, email: m[2].trim() };
  return { name: null, email: raw.trim() };
}

function decodeBody(payload) {
  let bodyText = null;
  let bodyHtml = null;
  const mime = payload.mimeType || '';
  const body = payload.body || {};
  const parts = payload.parts || [];

  if (mime === 'text/plain' && body.data) {
    bodyText = Buffer.from(body.data, 'base64').toString('utf-8');
  } else if (mime === 'text/html' && body.data) {
    bodyHtml = Buffer.from(body.data, 'base64').toString('utf-8');
  } else if (mime.startsWith('multipart/')) {
    for (const part of parts) {
      const { bodyText: t, bodyHtml: h } = decodeBody(part);
      if (t && !bodyText) bodyText = t;
      if (h && !bodyHtml) bodyHtml = h;
    }
  }
  return { bodyText, bodyHtml };
}

function extractAttachments(payload) {
  const result = [];
  const filename = payload.filename || '';
  const body = payload.body || {};
  if (filename && body.attachmentId) {
    result.push({
      filename,
      mime_type: payload.mimeType || '',
      size: body.size || 0,
      attachment_id: body.attachmentId,
    });
  }
  for (const part of payload.parts || []) {
    result.push(...extractAttachments(part));
  }
  return result;
}

function stripHtml(html) {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function parseMessage(msg) {
  try {
    const payload = msg.payload || {};
    const headers = payload.headers || [];
    const h = (name) => (headers.find(x => x.name.toLowerCase() === name.toLowerCase()) || {}).value || '';

    const { bodyText, bodyHtml } = decodeBody(payload);
    const attachments = extractAttachments(payload);

    return {
      id: msg.id,
      thread_id: msg.threadId,
      subject: h('Subject') || '(제목 없음)',
      sender: parseAddress(h('From')),
      recipients: (h('To') || '').split(',').filter(Boolean).map(a => parseAddress(a.trim())),
      date: h('Date'),
      snippet: msg.snippet || '',
      body_text: bodyText || (bodyHtml ? stripHtml(bodyHtml) : null),
      body_html: bodyHtml,
      labels: msg.labelIds || [],
      is_read: !(msg.labelIds || []).includes('UNREAD'),
      attachments,
    };
  } catch (e) {
    console.error('parseMessage error:', e.message);
    return null;
  }
}

module.exports = { getAuthUrl, exchangeCode, getUserEmail, fetchEmails, fetchAttachment };
