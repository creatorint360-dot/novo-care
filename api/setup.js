'use strict';
// One-time setup: creates the FIRST Administrator.
// It works only while the users table is empty and needs the secret SETUP_TOKEN.
// After the first account exists, this route refuses every request.

const crypto = require('crypto');
const db = require('../lib/db');
const { route, json } = require('../lib/http');
const { makeCredentials, passwordPolicyErrors } = require('../lib/security');
const { validateNewUser } = require('../lib/validate');
const { audit } = require('../lib/audit');

function tokenMatches(given) {
  const a = Buffer.from(String(given || ''));
  const b = Buffer.from(String(process.env.SETUP_TOKEN || ''));
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}

module.exports = route({ methods: ['GET', 'POST'], auth: false }, async ({ req, res, body, ip }) => {
  const { rows } = await db.query('select count(*)::int as n from users');
  const open = rows[0].n === 0 && Boolean(process.env.SETUP_TOKEN);

  if (req.method === 'GET') return json(res, 200, { open });
  if (!open) return json(res, 403, { error: 'Setup is closed.' });
  if (!tokenMatches(body.token)) return json(res, 403, { error: 'Wrong setup token.' });

  const fields = {
    username: String(body.username || '').trim(),
    full_name: String(body.full_name || '').trim(),
    email: String(body.email || '').trim(),
  };
  const password = String(body.password || '');
  const errors = [...validateNewUser(fields), ...passwordPolicyErrors(password)];
  if (errors.length) return json(res, 400, { error: errors.join(' ') });

  const cred = await makeCredentials(password);     // salt, pepper, concatenation, hash
  await db.query(
    `insert into users (username, full_name, email, password_hash, salt, pepper, salt_pepper, role_id)
     values ($1, $2, $3, $4, $5, $6, $7, (select id from roles where name = 'administrator'))`,
    [fields.username, fields.full_name, fields.email, cred.password_hash, cred.salt, cred.pepper, cred.salt_pepper]
  );
  await audit('user_created', 'Bootstrap administrator', null, fields.username, ip);
  return json(res, 201, { ok: true });
});
