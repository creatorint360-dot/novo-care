'use strict';
// Backup, restore and reset.
//
//   Backup   Manager, Admin, Administrator   saves an ENCRYPTED snapshot of users + records
//   Restore  Administrator only              puts the records from a snapshot back
//   Reset    Administrator only              empties the records (a working-data reset)
//
// Restore and Reset never touch accounts, passwords, 2FA, roles or settings.
// Both first take an automatic backup, ask for the Administrator's password again,
// and are written to the audit log.

const db = require('../lib/db');
const { route, json, forbid } = require('../lib/http');
const rbac = require('../lib/rbac');
const { encrypt, decrypt } = require('../lib/crypto');
const { verifyCredentials } = require('../lib/security');
const { registerFailure } = require('../lib/lockout');
const { audit } = require('../lib/audit');
const { labels } = require('../lib/labels');

const KEEP = 20;          // the newest 20 snapshots are kept

// One SQL statement reads users and records together, so the snapshot is consistent.
async function takeSnapshot(kind, user) {
  const { rows } = await db.query(
    `select
       (select coalesce(json_agg(u order by u.id), '[]'::json) from
         (select id, username, full_name, email, password_hash, salt, pepper, salt_pepper, role_id,
                 totp_secret, totp_enabled, created_by, created_at from users) u) as users,
       (select coalesce(json_agg(r order by r.id), '[]'::json) from
         (select id, user_id, title, details, created_at from records) r) as records`);
  const { users, records } = rows[0];
  const data = encrypt(JSON.stringify({ version: 1, taken_at: new Date().toISOString(), users, records }));
  const ins = await db.query(
    `insert into backups (created_by, created_by_name, kind, users_count, records_count, data)
     values ($1, $2, $3, $4, $5, $6) returning id, created_at`,
    [user.id, user.username, kind, users.length, records.length, data]);
  await db.query('delete from backups where id not in (select id from backups order by id desc limit $1)', [KEEP]);
  return { id: ins.rows[0].id, createdAt: ins.rows[0].created_at, users: users.length, records: records.length };
}

// The Administrator must type their password again for dangerous actions.
async function passwordOk(user, password, ip) {
  const { rows } = await db.query('select * from users where id = $1', [user.id]);
  if (await verifyCredentials(rows[0], String(password || ''))) return { ok: true };
  const locked = await registerFailure(rows[0], 'password_check_failed', 'Wrong password on a dangerous action', ip);
  return { ok: false, locked };
}

module.exports = route({ methods: ['GET', 'POST'], roles: ['manager', 'admin', 'administrator'] }, async ({ req, res, body, user, ip }) => {
  if (req.method === 'GET') {
    const { rows } = await db.query(
      `select id, created_at, created_by_name, kind, users_count, records_count
         from backups order by id desc`);
    return json(res, 200, { backups: rows.map((b) => ({
      id: b.id, createdAt: b.created_at, by: b.created_by_name, kind: b.kind,
      users: b.users_count, records: b.records_count })) });
  }

  // ---- create a backup ----
  if (body.action === 'create') {
    const snap = await takeSnapshot('manual', user);
    await audit('backup_created', 'Backup #' + snap.id + ' (' + snap.users + ' users, ' + snap.records + ' records)', user.id, user.username, ip);
    return json(res, 201, { ok: true, backup: snap, message: 'Backup #' + snap.id + ' saved: ' + snap.users + ' users and ' + snap.records + ' ' + labels().records + '.' });
  }

  // ---- everything below is Administrator only ----
  if (body.action !== 'restore' && body.action !== 'reset') return json(res, 400, { error: 'Unknown action.' });
  if (!rbac.canRestoreOrReset(user.role)) return forbid(res, user, ip, 'Tried to ' + body.action + ' the system');

  const check = await passwordOk(user, body.password, ip);
  if (!check.ok) {
    return json(res, check.locked ? 429 : 401, { error: check.locked ? 'Too many failed attempts. Your account is locked for a while.' : 'Your password is incorrect.' });
  }

  if (body.action === 'reset') {
    if (body.confirm !== 'RESET') return json(res, 400, { error: 'Type RESET (capital letters) to confirm.' });
    const safety = await takeSnapshot('auto before reset', user);
    const del = await db.query('delete from records');
    await audit('system_reset', 'Deleted ' + del.rowCount + ' records. Safety backup #' + safety.id, user.id, user.username, ip);
    return json(res, 200, { ok: true, message: 'System reset: ' + del.rowCount + ' ' + labels().records + ' removed. Accounts and settings were not changed. Safety backup #' + safety.id + ' was saved first.' });
  }

  // ---- restore ----
  const id = Number(body.id) || 0;
  const found = await db.query('select id, data from backups where id = $1', [id]);
  if (!found.rows[0]) return json(res, 404, { error: 'Backup not found.' });
  let snapshot;
  try { snapshot = JSON.parse(decrypt(found.rows[0].data)); } catch (e) { snapshot = null; }
  if (!snapshot || !Array.isArray(snapshot.records)) return json(res, 500, { error: 'That backup could not be read.' });

  const safety = await takeSnapshot('auto before restore', user);
  // One statement = all or nothing: delete the current records and insert the saved ones
  // (only for accounts that still exist).
  const done = await db.query(
    `with removed as (delete from records returning 1)
     insert into records (user_id, title, details, created_at)
     select r.user_id, r.title, r.details, r.created_at
       from jsonb_to_recordset($1::jsonb) as r(user_id int, title text, details text, created_at timestamptz)
      where exists (select 1 from users u where u.id = r.user_id)`,
    [JSON.stringify(snapshot.records)]);
  const skipped = snapshot.records.length - done.rowCount;
  await audit('backup_restored', 'Restored backup #' + id + ': ' + done.rowCount + ' records' + (skipped ? ', ' + skipped + ' skipped (owner deleted)' : '') + '. Safety backup #' + safety.id, user.id, user.username, ip);
  return json(res, 200, { ok: true, message: 'Restored ' + done.rowCount + ' ' + labels().records + ' from backup #' + id + (skipped ? ' (' + skipped + ' skipped because their owner no longer exists)' : '') + '. Accounts and settings were not changed. Safety backup #' + safety.id + ' was saved first.' });
});
