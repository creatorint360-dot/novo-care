'use strict';
// User management, with the role rules checked on the server:
//   add      Manager (Inputters only), Administrator (Inputter, Manager, Admin)
//   list     Admin (Inputters only), Administrator (everyone)
//   delete   Admin and Administrator, Inputter accounts only
//   unlock / reset2fa   Administrator only

const db = require('../lib/db');
const { route, json, forbid } = require('../lib/http');
const rbac = require('../lib/rbac');
const { makeCredentials, passwordPolicyErrors } = require('../lib/security');
const { validateNewUser } = require('../lib/validate');
const { audit } = require('../lib/audit');

module.exports = route({ methods: ['GET', 'POST'] }, async ({ req, res, body, user, ip }) => {
  // ---------------- list ----------------
  if (req.method === 'GET') {
    if (!rbac.canDeleteInputters(user.role)) return forbid(res, user, ip, 'users list');
    const sql = `select u.id, u.username, u.full_name, u.email, r.name as role, u.totp_enabled,
                        (u.locked_until is not null and u.locked_until > now()) as is_locked
                   from users u join roles r on r.id = u.role_id`
      + (user.role === 'administrator' ? '' : " where r.name = 'inputter'")
      + ' order by u.id';
    const { rows } = await db.query(sql);
    return json(res, 200, { users: rows });
  }

  const action = String(body.action || '');

  // ---------------- add ----------------
  if (action === 'add') {
    const allowed = rbac.creatableRoles(user.role);
    if (!allowed.length) return forbid(res, user, ip, 'add user');

    const fields = {
      username: String(body.username || '').trim(),
      full_name: String(body.full_name || '').trim(),
      email: String(body.email || '').trim(),
    };
    const password = String(body.password || '');
    const role = String(body.role || '');

    const errors = [...validateNewUser(fields), ...passwordPolicyErrors(password)];
    // Server-side authorization: the role chosen must be one this user may create.
    if (!allowed.includes(role)) errors.push('You are not allowed to create that role.');
    if (errors.length) return json(res, 400, { error: errors.join(' ') });

    const dup = await db.query('select 1 from users where username = $1 or email = $2', [fields.username, fields.email]);
    if (dup.rows.length) return json(res, 409, { error: 'That username or email is already in use.' });

    const cred = await makeCredentials(password);      // salt, pepper, concatenation, hash
    await db.query(
      `insert into users (username, full_name, email, password_hash, salt, pepper, salt_pepper, role_id, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, (select id from roles where name = $8), $9)`,
      [fields.username, fields.full_name, fields.email, cred.password_hash, cred.salt, cred.pepper, cred.salt_pepper, role, user.id]
    );
    await audit('user_created', `Created ${fields.username} as ${role}`, user.id, user.username, ip);
    return json(res, 201, { ok: true, message: `Account '${fields.username}' created as ${role}. They will set up 2FA at first sign-in.` });
  }

  // ---------------- actions on an existing user ----------------
  const found = await db.query(
    'select u.id, u.username, r.name as role from users u join roles r on r.id = u.role_id where u.id = $1',
    [Number(body.id) || 0]
  );
  const target = found.rows[0];

  if (action === 'delete') {
    if (!rbac.canDeleteInputters(user.role)) return forbid(res, user, ip, 'delete user');
    if (!target) return json(res, 404, { error: 'User not found.' });
    if (target.role !== 'inputter') {
      await audit('delete_denied', `Tried to delete ${target.username} (${target.role})`, user.id, user.username, ip);
      return json(res, 403, { error: 'You can only delete Inputter accounts.' });
    }
    await db.query('delete from users where id = $1', [target.id]);
    await audit('user_deleted', `Deleted inputter ${target.username}`, user.id, user.username, ip);
    return json(res, 200, { ok: true, message: `Inputter '${target.username}' was deleted.` });
  }

  if (action === 'unlock' || action === 'reset2fa') {
    if (!rbac.canRecoverAccounts(user.role)) return forbid(res, user, ip, action);
    if (!target) return json(res, 404, { error: 'User not found.' });

    if (action === 'unlock') {
      await db.query('update users set failed_attempts = 0, locked_until = null where id = $1', [target.id]);
      await audit('account_unlocked', `Unlocked ${target.username}`, user.id, user.username, ip);
      return json(res, 200, { ok: true, message: `'${target.username}' was unlocked.` });
    }
    // Reset 2FA (for example a lost phone). Raising session_version signs the user out everywhere.
    await db.query(
      'update users set totp_secret = null, totp_enabled = false, last_totp_step = 0, session_version = session_version + 1 where id = $1',
      [target.id]
    );
    await audit('2fa_reset', `Reset 2FA for ${target.username}`, user.id, user.username, ip);
    return json(res, 200, { ok: true, message: `2FA reset for '${target.username}'. They will enrol a new device at next sign-in.` });
  }

  return json(res, 400, { error: 'Unknown action.' });
});
