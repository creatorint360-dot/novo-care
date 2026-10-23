'use strict';
// Step 1 of 2: username and password.
// A correct password does NOT sign the user in. It only starts the 2FA step.

const db = require('../lib/db');
const { route, json } = require('../lib/http');
const { verifyCredentials, dummyCredentialCheck } = require('../lib/security');
const { registerFailure } = require('../lib/lockout');
const { audit } = require('../lib/audit');
const session = require('../lib/session');
const totp = require('../lib/totp');

// The same message for a wrong username and a wrong password, so an attacker
// cannot find out which usernames exist.
const GENERIC = 'Incorrect username or password.';

module.exports = route({ methods: ['POST'], auth: false }, async ({ req, res, body, ip }) => {
  const username = String(body.username || '').trim().slice(0, 50);
  const password = String(body.password || '');

  const { rows } = await db.query(
    `select u.*,
            (u.locked_until is not null and u.locked_until > now()) as is_locked,
            greatest(1, ceil(extract(epoch from (u.locked_until - now())) / 60)) as lock_minutes
       from users u where u.username = $1`,
    [username]
  );
  const user = rows[0];

  if (!user) {
    await dummyCredentialCheck(password);   // same time as a real check
    await audit('login_failed', 'Unknown username', null, username, ip);
    return json(res, 401, { error: GENERIC });
  }

  if (user.is_locked) {
    await audit('login_blocked', 'Account locked', user.id, user.username, ip);
    return json(res, 429, { error: `Too many failed attempts. Try again in ${Math.ceil(Number(user.lock_minutes))} minute(s).` });
  }

  if (!(await verifyCredentials(user, password))) {
    await registerFailure(user, 'login_failed', 'Wrong password', ip);
    return json(res, 401, { error: GENERIC });
  }

  // Password correct. The failed-attempt counter is NOT reset here, only after the
  // 2FA code is also correct, so a stolen password cannot be used to keep guessing codes.
  const pending = { uid: user.id };
  if (!user.totp_enabled) pending.enroll = totp.generateSecret();   // new device: show a QR code
  session.setPending(req, res, pending);
  await audit('password_verified', 'Awaiting 2FA', user.id, user.username, ip);
  return json(res, 200, { next: 'twofactor', enrolling: !user.totp_enabled });
});
