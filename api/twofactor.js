'use strict';
// Step 2 of 2: the 6-digit code from the authenticator app.
//   GET   -> what to show (a QR code the first time, then just the code box)
//   POST  -> check the code and sign the user in

const db = require('../lib/db');
const { route, json } = require('../lib/http');
const { registerFailure } = require('../lib/lockout');
const { audit } = require('../lib/audit');
const { encrypt, decrypt } = require('../lib/crypto');
const session = require('../lib/session');
const totp = require('../lib/totp');
const QRCode = require('qrcode');

const RESTART = { error: 'Please sign in again.', restart: true };

module.exports = route({ methods: ['GET', 'POST'], auth: false }, async ({ req, res, body, ip }) => {
  const pending = session.getPending(req);
  if (!pending) return json(res, 401, RESTART);

  const { rows } = await db.query(
    `select u.*, (u.locked_until is not null and u.locked_until > now()) as is_locked
       from users u where u.id = $1`,
    [pending.uid]
  );
  const user = rows[0];
  if (!user) return json(res, 401, RESTART);

  const enrolling = !user.totp_enabled;
  const secret = enrolling ? pending.enroll : decrypt(user.totp_secret);
  if (!secret) return json(res, 401, RESTART);

  if (req.method === 'GET') {
    if (!enrolling) return json(res, 200, { enrolling: false, username: user.username });
    const uri = totp.uri(secret, user.username);
    const qr = await QRCode.toString(uri, { type: 'svg', margin: 1, width: 210 });   // drawn on the server
    return json(res, 200, { enrolling: true, username: user.username, secret, uri, qr });
  }

  if (user.is_locked) {
    session.clearPending(req, res);
    return json(res, 429, { error: 'Too many failed attempts. Please try again later.', restart: true });
  }

  const step = totp.verify(secret, String(body.code || ''), Number(user.last_totp_step));
  if (step === null) {
    const locked = await registerFailure(user, '2fa_failed', 'Wrong or reused code', ip);
    if (locked) {
      session.clearPending(req, res);
      return json(res, 429, { error: 'Too many wrong codes. Your account is locked for a while.', restart: true });
    }
    return json(res, 401, { error: 'That code is not correct, or it was already used. Wait for a new code and try again.' });
  }

  // Code correct: remember the step so the same code cannot be used again.
  if (enrolling) {
    await db.query(
      'update users set totp_secret = $1, totp_enabled = true, last_totp_step = $2, failed_attempts = 0, locked_until = null where id = $3',
      [encrypt(secret), step, user.id]          // the secret is stored encrypted (AES-256-GCM)
    );
    await audit('2fa_enrolled', 'Authenticator app linked', user.id, user.username, ip);
  } else {
    await db.query(
      'update users set last_totp_step = $1, failed_attempts = 0, locked_until = null where id = $2',
      [step, user.id]
    );
  }

  session.clearPending(req, res);
  session.issueSession(req, res, user);
  await audit('login_success', 'Password + 2FA verified', user.id, user.username, ip);
  return json(res, 200, { ok: true });
});
