// auth.js — minimal shared-password auth for the rep tool (Phase 4).
//
// Design goals: zero new dependencies, safe defaults, good enough for a 1–2 rep
// pilot behind HTTPS. A rep types one shared password (REP_PASSWORD); on success
// we set an httpOnly, signed session cookie. The cookie carries only an expiry
// timestamp plus an HMAC signature — no secrets, and it can't be forged without
// SESSION_SECRET. This is NOT per-user identity; swap for real accounts if you
// need per-rep audit trails (see GO-LIVE-CHECKLIST Phase 4).

const crypto = require('crypto');

const COOKIE_NAME = 'rep_session';

function ttlMs() {
  const hours = Number(process.env.SESSION_TTL_HOURS) || 12;
  return hours * 60 * 60 * 1000;
}

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error('SESSION_SECRET is not set');
  return s;
}

// Constant-time string compare that also tolerates length differences.
function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) {
    // Still do a compare to keep timing roughly constant, then fail.
    crypto.timingSafeEqual(ab, ab);
    return false;
  }
  return crypto.timingSafeEqual(ab, bb);
}

function sign(payload) {
  return crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
}

// Token = base64url({exp}).<hmac>. Opaque to the client.
function issueToken() {
  const exp = Date.now() + ttlMs();
  const payload = Buffer.from(JSON.stringify({ exp })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return false;
  const [payload, mac] = token.split('.');
  if (!payload || !mac) return false;
  if (!safeEqual(mac, sign(payload))) return false;
  try {
    const { exp } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return typeof exp === 'number' && Date.now() < exp;
  } catch {
    return false;
  }
}

// Parse a single cookie out of the Cookie header without cookie-parser.
function readCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) {
      return decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return null;
}

function isAuthed(req) {
  return verifyToken(readCookie(req, COOKIE_NAME));
}

function setSessionCookie(res, secure) {
  const attrs = [
    `${COOKIE_NAME}=${issueToken()}`,
    'HttpOnly',
    'SameSite=Strict',
    'Path=/',
    `Max-Age=${Math.floor(ttlMs() / 1000)}`
  ];
  if (secure) attrs.push('Secure');
  res.setHeader('Set-Cookie', attrs.join('; '));
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
}

// Whether the shared password matches REP_PASSWORD.
function checkPassword(candidate) {
  const expected = process.env.REP_PASSWORD;
  if (!expected) return false;
  return safeEqual(candidate || '', expected);
}

module.exports = {
  COOKIE_NAME,
  isAuthed,
  checkPassword,
  setSessionCookie,
  clearSessionCookie,
};
