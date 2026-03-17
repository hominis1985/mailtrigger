const { getCookieValue, setCookie } = require('../lib/cookies');
const { fetchEmails, fetchAttachment } = require('../lib/gmail');
const { hasKeywords, containsKeywords, classifyEmail } = require('../lib/gemini');
const { extractText } = require('../lib/attachments');

const CONCURRENCY = 3;

module.exports = async (req, res) => {
  // ── Auth check ──────────────────────────────────────────
  const tokens = getCookieValue(req, 'gmail_tokens');
  if (!tokens || !tokens.access_token) {
    return res.status(401).json({ detail: 'Gmail 인증이 필요합니다.' });
  }

  const settings = getCookieValue(req, 'user_settings') || {};
  const apiKey = settings.gemini_api_key || process.env.GEMINI_API_KEY || '';
  const model = settings.gemini_model || 'gemini-2.5-flash-lite';

  if (!apiKey) {
    return res.status(400).json({ detail: 'Gemini API 키가 설정되지 않았습니다.' });
  }

  const maxResults = Math.min(parseInt(req.query.max_results) || 50, 100);

  try {
    // ── Fetch from Gmail ─────────────────────────────────
    const { emails: rawEmails, newTokens } = await fetchEmails(tokens, maxResults);

    if (newTokens) {
      setCookie(res, 'gmail_tokens', JSON.stringify(newTokens));
    }

    const totalFetched = rawEmails.length;
    if (!totalFetched) {
      return res.json({ emails: [], total: 0, total_fetched: 0, categories: {} });
    }

    // ── Process with concurrency limit ───────────────────
    const classified = [];
    for (let i = 0; i < rawEmails.length; i += CONCURRENCY) {
      const batch = rawEmails.slice(i, i + CONCURRENCY);
      const results = await Promise.all(
        batch.map(email => processEmail(email, tokens, apiKey, model))
      );
      classified.push(...results.filter(Boolean));
    }

    // ── Build category counts ────────────────────────────
    const categories = {};
    for (const e of classified) {
      categories[e.category] = (categories[e.category] || 0) + 1;
    }

    const categoryFilter = req.query.category;
    const filtered = (categoryFilter && categoryFilter !== 'All')
      ? classified.filter(e => e.category === categoryFilter)
      : classified;

    res.json({ emails: filtered, total: filtered.length, total_fetched: totalFetched, categories });

  } catch (e) {
    console.error('emails endpoint error:', e);
    const status = (e.code === 401 || e.status === 401) ? 401 : 500;
    res.status(status).json({ detail: e.message });
  }
};

// ── Per-email processing ──────────────────────────────────
async function processEmail(email, tokens, apiKey, model) {
  try {
    const foundInText = hasKeywords(email);

    // Fetch attachment texts
    let attachmentTexts = [];
    if (email.attachments && email.attachments.length > 0) {
      const results = await Promise.all(
        email.attachments.slice(0, 3).map(async att => {
          try {
            const buffer = await fetchAttachment(tokens, email.id, att.attachment_id);
            const text = await extractText(buffer, att.filename, att.mime_type);
            return text ? [att.filename, text] : null;
          } catch (e) {
            console.error(`Attachment error (${att.filename}):`, e.message);
            return null;
          }
        })
      );
      attachmentTexts = results.filter(Boolean);
    }

    // Keyword check
    if (!foundInText) {
      const foundInAttachments = attachmentTexts.some(([, txt]) => containsKeywords(txt));
      if (!foundInAttachments) return null;
    }

    // AI classification
    const { category, summary, table, reason } = await classifyEmail(email, attachmentTexts, apiKey, model);

    // null category = AI decided this is not a relevant document
    if (!category) {
      console.log(`[SKIP] "${email.subject}" — ${reason}`);
      return null;
    }

    console.log(`[MATCH] ${category} — "${email.subject}" (${reason})`);
    return { ...email, category, summary, table, ai_processed: true };
  } catch (e) {
    console.error(`processEmail error (${email.id}):`, e.message);
    return null;
  }
}
