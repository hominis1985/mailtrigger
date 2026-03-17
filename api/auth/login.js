const { getAuthUrl } = require('../../lib/gmail');

module.exports = async (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return res.status(400).json({
      detail: 'Google OAuth 환경변수가 설정되지 않았습니다. Vercel 대시보드에서 GOOGLE_CLIENT_ID와 GOOGLE_CLIENT_SECRET을 설정해주세요.',
    });
  }
  try {
    res.json({ auth_url: getAuthUrl() });
  } catch (e) {
    res.status(500).json({ detail: e.message });
  }
};
