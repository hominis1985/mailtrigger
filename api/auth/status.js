const { getCookieValue } = require('../../lib/cookies');
const { getUserEmail } = require('../../lib/gmail');

module.exports = async (req, res) => {
  const tokens = getCookieValue(req, 'gmail_tokens');
  if (!tokens || !tokens.access_token) {
    return res.json({ is_authenticated: false, email: null });
  }
  try {
    const email = await getUserEmail(tokens);
    res.json({ is_authenticated: true, email });
  } catch (e) {
    res.json({ is_authenticated: false, email: null });
  }
};
