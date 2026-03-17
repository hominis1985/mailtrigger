const { testApiKey } = require('../../lib/gemini');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ detail: 'Method not allowed' });

  const { gemini_api_key, gemini_model } = req.body || {};
  if (!gemini_api_key) return res.status(400).json({ detail: 'API key is required' });

  const { valid, message } = await testApiKey(gemini_api_key, gemini_model);
  if (valid) return res.json({ message });
  return res.status(400).json({ detail: `Invalid API key: ${message}` });
};
