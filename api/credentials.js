'use strict';
// "Salt and pepper" inspector, for demonstration (Administrator only).
//   GET   the salt, pepper, salt+pepper and hash stored for every user
//   POST  type a username and password to watch the 4 steps happen live
// It works only while DEMO_MODE=true, and every use is written to the audit log.

const db = require('../lib/db');
const { route, json } = require('../lib/http');
const sec = require('../lib/security');
const { audit } = require('../lib/audit');

module.exports = route({ methods: ['GET', 'POST'], roles: ['administrator'] }, async ({ req, res, body, user, ip }) => {
  if (!sec.demoMode()) {
    return json(res, 403, { error: 'Demo mode is off. Set DEMO_MODE=true to use the salt and pepper inspector.' });
  }

  if (req.method === 'GET') {
    const { rows } = await db.query(
      `select u.id, u.username, r.name as role, u.salt, u.pepper, u.salt_pepper, u.password_hash
         from users u join roles r on r.id = u.role_id order by u.id`
    );
    await audit('credentials_viewed', 'Viewed salt and pepper table', user.id, user.username, ip);
    return json(res, 200, { users: rows, rounds: sec.HASH_ROUNDS });
  }

  // POST: step-by-step proof for one user
  const username = String(body.username || '').trim();
  const password = String(body.password || '');
  const found = await db.query('select username, salt, password_hash from users where username = $1', [username]);
  const target = found.rows[0];
  if (!target) return json(res, 404, { error: 'No such user.' });

  const salt = target.salt;                                         // step 1, from the database
  const pepper = sec.getPepper();                                   // step 2, from the environment
  const saltPepper = sec.combineSaltAndPepper(salt, pepper);        // step 3
  const computed = await sec.hashWithSaltPepper(password, saltPepper);   // step 4
  const match = computed === target.password_hash;

  await audit('credentials_inspected', `Step-by-step check for ${target.username}`, user.id, user.username, ip);
  return json(res, 200, {
    username: target.username,
    rounds: sec.HASH_ROUNDS,
    steps: { password, salt, pepper, saltPepper, computed, stored: target.password_hash },
    match,
  });
});
