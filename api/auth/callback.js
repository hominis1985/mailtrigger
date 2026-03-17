const { exchangeCode } = require('../../lib/gmail');
const { setCookie } = require('../../lib/cookies');

module.exports = async (req, res) => {
  const { code, error } = req.query;

  if (error || !code) {
    const msg = encodeURIComponent(error || 'No authorization code');
    return res.writeHead(302, { Location: `/?auth=error&message=${msg}` }).end();
  }

  try {
    const tokens = await exchangeCode(code);
    setCookie(res, 'gmail_tokens', JSON.stringify(tokens));
    res.writeHead(302, { Location: '/?auth=success' }).end();
  } catch (e) {
    const msg = encodeURIComponent(e.message.slice(0, 100));
    res.writeHead(302, { Location: `/?auth=error&message=${msg}` }).end();
  }
};
