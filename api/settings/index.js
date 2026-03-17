const { getCookieValue, setCookie } = require('../../lib/cookies');

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    const s = getCookieValue(req, 'user_settings') || {};
    return res.json({
      gemini_api_key: s.gemini_api_key || process.env.GEMINI_API_KEY || '',
      gemini_model: s.gemini_model || 'gemini-2.5-flash-lite',
      is_gmail_authenticated: !!(getCookieValue(req, 'gmail_tokens')),
    });
  }

  if (req.method === 'POST') {
    const { gemini_api_key, gemini_model } = req.body || {};
    setCookie(res, 'user_settings', JSON.stringify({ gemini_api_key, gemini_model }));
    return res.json({ message: 'Settings saved successfully' });
  }

  res.status(405).json({ detail: 'Method not allowed' });
};
