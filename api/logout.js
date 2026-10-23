'use strict';
// Sign out. Raising the user's session_version also cancels the old cookie on
// the server side, so a copied cookie cannot be reused after sign-out.

const db = require('../lib/db');
const { route, json } = require('../lib/http');
const { audit } = require('../lib/audit');
const session = require('../lib/session');

module.exports = route({ methods: ['POST'], auth: false }, async ({ req, res, ip }) => {
  const p = session.peek(req);
  if (p && p.uid) {
    const { rows } = await db.query(
      'update users set session_version = session_version + 1 where id = $1 returning username',
      [p.uid]
    );
    if (rows[0]) await audit('logout', null, p.uid, rows[0].username, ip);
  }
  session.clearSession(req, res);
  session.clearPending(req, res);
  return json(res, 200, { ok: true });
});
