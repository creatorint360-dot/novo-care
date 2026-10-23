'use strict';
// Sessions. The login state lives in a SIGNED cookie. The signature (HMAC-SHA256 with SESSION_SECRET)
// means nobody can change the cookie without the server noticing.
//
// Cookie flags: HttpOnly (JavaScript cannot read it), SameSite=Strict (not sent
// from other websites), Secure (HTTPS only, on Render).
//
// Two cookies:
//   sh_pending  password was correct, 2FA code still needed (valid 5 minutes)
//   sh_session  fully signed in (ends after 15 minutes without activity)

const crypto = require('crypto');
const db = require('./db');

const SESSION_COOKIE = 'sh_session';
const PENDING_COOKIE = 'sh_pending';
const INACTIVITY_SECONDS = 15 * 60;
const MAX_LIFETIME_SECONDS = 8 * 60 * 60;
const PENDING_SECONDS = 5 * 60;

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error('SESSION_SECRET is missing or too short');
  return s;
}

const b64url = (buf) => Buffer.from(buf).toString('base64url');
const mac = (text) => crypto.createHmac('sha256', secret()).update(text).digest('base64url');
const now = () => Math.floor(Date.now() / 1000);

function sign(payload) {
  const body = b64url(JSON.stringify(payload));
  return body + '.' + mac(body);
}

function unsign(token) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [body, signature] = token.split('.');
  const expected = mac(body);
  const a = Buffer.from(signature || '');
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;   // forged or changed
  try { return JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch (e) { return null; }
}

function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

function isSecure(req) {
  return String(req.headers['x-forwarded-proto'] || '').includes('https') || Boolean(process.env.RENDER);
}

function setCookie(req, res, name, value, maxAge) {
  const parts = [name + '=' + value, 'Path=/', 'HttpOnly', 'SameSite=Strict'];
  if (maxAge !== undefined) parts.push('Max-Age=' + maxAge);
  if (isSecure(req)) parts.push('Secure');
  const previous = res.getHeader('Set-Cookie');
  const list = Array.isArray(previous) ? previous : previous ? [previous] : [];
  list.push(parts.join('; '));
  res.setHeader('Set-Cookie', list);
}

// ---- pending (password ok, waiting for the 2FA code) ----
function setPending(req, res, data) {
  setCookie(req, res, PENDING_COOKIE, sign({ ...data, iat: now() }), PENDING_SECONDS);
}

function getPending(req) {
  const p = unsign(parseCookies(req.headers.cookie)[PENDING_COOKIE]);
  if (!p || !p.uid || now() - p.iat > PENDING_SECONDS) return null;
  return p;
}

function clearPending(req, res) {
  setCookie(req, res, PENDING_COOKIE, '', 0);
}

// ---- full session ----
function issueSession(req, res, user, startedAt) {
  const t = now();
  setCookie(req, res, SESSION_COOKIE, sign({ uid: user.id, ver: user.session_version, iat: startedAt || t, last: t }));
}

function clearSession(req, res) {
  setCookie(req, res, SESSION_COOKIE, '', 0);
}

function peek(req) {
  return unsign(parseCookies(req.headers.cookie)[SESSION_COOKIE]);
}

// Returns the signed-in user, or null. Also renews the 15-minute inactivity timer.
async function currentUser(req, res) {
  const p = peek(req);
  if (!p || !p.uid) return null;
  const t = now();
  if (t - p.last > INACTIVITY_SECONDS || t - p.iat > MAX_LIFETIME_SECONDS) return null;

  const { rows } = await db.query(
    `select u.id, u.username, u.full_name, u.email, u.session_version, r.name as role,
            (u.locked_until is not null and u.locked_until > now()) as is_locked
       from users u join roles r on r.id = u.role_id
      where u.id = $1`,
    [p.uid]
  );
  const user = rows[0];
  // The user must still exist, not be locked, and the session version must match
  // (it changes when the password changes, 2FA is reset, or the user signs out).
  if (!user || user.is_locked || Number(user.session_version) !== Number(p.ver)) return null;

  issueSession(req, res, user, p.iat);
  return user;
}

module.exports = {
  sign, unsign, parseCookies,
  setPending, getPending, clearPending,
  issueSession, clearSession, peek, currentUser,
};
