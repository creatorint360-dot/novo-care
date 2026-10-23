'use strict';
// Every user can change their OWN password at any time.
// The current password is required, so a stolen session alone cannot take over
// the account. A new salt is generated every time.

const db = require('../lib/db');
const { route, json } = require('../lib/http');
const { verifyCredentials, makeCredentials, passwordPolicyErrors } = require('../lib/security');
const { registerFailure } = require('../lib/lockout');
const { audit } = require('../lib/audit');
const session = require('../lib/session');

module.exports = route({ methods: ['POST'] }, async ({ req, res, body, user, ip }) => {
  const current = String(body.current || '');
  const next = String(body.new || '');
  const confirm = String(body.confirm || '');

  const { rows } = await db.query('select * from users where id = $1', [user.id]);
  const row = rows[0];

  if (!(await verifyCredentials(row, current))) {
    // Wrong "current password" attempts count toward the lockout too.
    const locked = await registerFailure(row, 'password_change_failed', 'Wrong current password', ip);
    return json(res, locked ? 429 : 401, { error: locked ? 'Too many failed attempts. Your account is locked for a while.' : 'Your current password is incorrect.' });
  }

  const errors = [];
  if (next !== confirm) errors.push('The new passwords do not match.');
  if (next === current) errors.push('The new password must be different from the current one.');
  errors.push(...passwordPolicyErrors(next));
  if (errors.length) return json(res, 400, { error: errors.join(' ') });

  const cred = await makeCredentials(next);            // new salt, then salt + pepper, then hash
  const updated = await db.query(
    `update users set password_hash = $1, salt = $2, pepper = $3, salt_pepper = $4,
                      session_version = session_version + 1
      where id = $5 returning id, session_version`,
    [cred.password_hash, cred.salt, cred.pepper, cred.salt_pepper, user.id]
  );
  // Old sessions on other devices stop working; this device stays signed in.
  const p = session.peek(req);
  session.issueSession(req, res, updated.rows[0], p && p.iat);
  await audit('password_changed', 'User changed own password', user.id, user.username, ip);
  return json(res, 200, { ok: true, message: 'Password changed successfully.' });
});
