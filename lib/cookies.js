const cookie = require('cookie');

const BASE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/',
  maxAge: 60 * 60 * 24 * 30, // 30 days
};

function parseCookies(req) {
  return cookie.parse(req.headers.cookie || '');
}

function getCookieValue(req, name) {
  const cookies = parseCookies(req);
  const value = cookies[name];
  if (!value) return null;
  try { return JSON.parse(value); } catch { return value; }
}

function setCookie(res, name, value, options = {}) {
  const serialized = cookie.serialize(
    name,
    typeof value === 'string' ? value : JSON.stringify(value),
    { ...BASE_OPTIONS, ...options }
  );
  const existing = res.getHeader('Set-Cookie') || [];
  const arr = Array.isArray(existing) ? existing : [existing];
  res.setHeader('Set-Cookie', [...arr, serialized]);
}

function clearCookie(res, name) {
  const serialized = cookie.serialize(name, '', { httpOnly: true, path: '/', maxAge: 0 });
  const existing = res.getHeader('Set-Cookie') || [];
  const arr = Array.isArray(existing) ? existing : [existing];
  res.setHeader('Set-Cookie', [...arr, serialized]);
}

module.exports = { getCookieValue, setCookie, clearCookie };
