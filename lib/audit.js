'use strict';
// Audit log: who did what, when, and from which IP address.
// A failure to write the log never stops the user's request.

const db = require('./db');

async function audit(action, detail, userId, username, ip) {
  try {
    await db.query(
      'insert into audit_log (user_id, username, action, detail, ip_address) values ($1, $2, $3, $4, $5)',
      [userId ?? null, username ?? null, action, detail ? String(detail).slice(0, 255) : null, ip ?? null]
    );
  } catch (e) {
    console.error('audit write failed:', e.message);
  }
}

module.exports = { audit };
