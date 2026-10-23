'use strict';
// Audit log page (Administrator only). The Administrator can delete single
// entries or clear the log, but the clearing itself is logged, so it never
// happens silently.

const db = require('../lib/db');
const { route, json } = require('../lib/http');
const { audit } = require('../lib/audit');

module.exports = route({ methods: ['GET', 'POST'], roles: ['administrator'] }, async ({ req, res, body, user, ip }) => {
  if (req.method === 'GET') {
    const { rows } = await db.query('select id, username, action, detail, ip_address, created_at from audit_log order by id desc limit 100');
    return json(res, 200, { entries: rows });
  }

  if (body.action === 'clear') {
    const del = await db.query('delete from audit_log');
    await audit('audit_cleared', `Cleared ${del.rowCount} log entries`, user.id, user.username, ip);
    return json(res, 200, { ok: true, message: `Cleared ${del.rowCount} entries.` });
  }
  if (body.action === 'delete') {
    const id = Number(body.id) || 0;
    await db.query('delete from audit_log where id = $1', [id]);
    await audit('audit_entry_deleted', `Deleted log entry #${id}`, user.id, user.username, ip);
    return json(res, 200, { ok: true, message: `Entry #${id} deleted.` });
  }
  return json(res, 400, { error: 'Unknown action.' });
});
