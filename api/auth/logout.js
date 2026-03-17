const { clearCookie } = require('../../lib/cookies');

module.exports = async (req, res) => {
  clearCookie(res, 'gmail_tokens');
  res.json({ message: 'Logged out successfully' });
};
