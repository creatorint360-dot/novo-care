'use strict';
// Staff records. The details are stored encrypted (AES-256-GCM).
//   Inputter                see and delete ONLY their own records
//   Manager                 see all records, delete only their own
//   Admin / Administrator   see all records, delete any record

const db = require('../lib/db');
const { route, json } = require('../lib/http');
const rbac = require('../lib/rbac');
const { encrypt, decrypt } = require('../lib/crypto');
const { audit } = require('../lib/audit');

module.exports = route({ methods: ['GET', 'POST'] }, async ({ req, res, body, user, ip }) => {
  if (req.method === 'GET') {
    const base = `select r.id, r.user_id, r.title, r.details, r.created_at, u.full_name
                    from records r join users u on u.id = r.user_id`;
    const { rows } = rbac.canSeeAllRecords(user.role)
      ? await db.query(base + ' order by r.id desc limit 100')
      : await db.query(base + ' where r.user_id = $1 order by r.id desc limit 100', [user.id]);

    return json(res, 200, {
      records: rows.map((r) => ({
        id: r.id,
        title: r.title,
        details: decrypt(r.details),
        fullName: r.full_name,
        createdAt: r.created_at,
        canDelete: r.user_id === user.id || rbac.canDeleteAnyRecord(user.role),
      })),
    });
  }

  // ---- delete ----
  if (body.action === 'delete') {
    const found = await db.query('select id, user_id, title from records where id = $1', [Number(body.id) || 0]);
    const rec = found.rows[0];
    if (!rec) return json(res, 404, { error: 'Record not found.' });
    if (!(rec.user_id === user.id || rbac.canDeleteAnyRecord(user.role))) {
      await audit('delete_denied', 'Tried to delete record #' + rec.id, user.id, user.username, ip);
      return json(res, 403, { error: 'You are not allowed to delete that record.' });
    }
    await db.query('delete from records where id = $1', [rec.id]);
    await audit('record_deleted', rec.title, user.id, user.username, ip);
    return json(res, 200, { ok: true });
  }

  // ---- add ----
  const title = String(body.title || '').trim();
  const details = String(body.details || '').trim();
  if (!title || !details || title.length > 150 || details.length > 5000) {
    return json(res, 400, { error: 'Enter a title (up to 150 characters) and the details.' });
  }
  await db.query('insert into records (user_id, title, details) values ($1, $2, $3)', [user.id, title, encrypt(details)]);
  await audit('record_added', title, user.id, user.username, ip);
  return json(res, 201, { ok: true });
});
