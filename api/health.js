const { getCookieValue } = require('../lib/cookies');

module.exports = async (req, res) => {
  const tokens = getCookieValue(req, 'gmail_tokens');
  const settings = getCookieValue(req, 'user_settings') || {};
  const geminiKey = settings.gemini_api_key || process.env.GEMINI_API_KEY || '';
  const hasOAuth = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

  res.json({
    status: 'ok',
    gmail_authenticated: !!(tokens && tokens.access_token),
    gemini_configured: !!geminiKey,
    client_secret_present: hasOAuth,
  });
};
