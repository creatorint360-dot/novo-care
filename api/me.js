'use strict';
// Who am I? Returns the signed-in user, what their role may do, and dashboard numbers.

const db = require('../lib/db');
const { route, json } = require('../lib/http');
const rbac = require('../lib/rbac');
const { demoMode } = require('../lib/security');
const { labels } = require('../lib/labels');

module.exports = route({ methods: ['GET'] }, async ({ res, user }) => {
  const stats = {};
  const L = labels();

  const mine = await db.query('select count(*)::int as n from records where user_id = $1', [user.id]);
  stats['My ' + L.records] = mine.rows[0].n;

  if (rbac.canSeeAllRecords(user.role)) {
    const all = await db.query('select count(*)::int as n from records');
    stats['All ' + L.records] = all.rows[0].n;
  }
  if (user.role !== 'inputter') {
    const r = await db.query("select count(*)::int as n from users u join roles r on r.id = u.role_id where r.name = 'inputter'");
    stats[L.rolePlurals.inputter] = r.rows[0].n;
  }
  if (user.role === 'administrator') {
    const u = await db.query('select count(*)::int as n from users');
    const a = await db.query('select count(*)::int as n from audit_log');
    stats['Total users'] = u.rows[0].n;
    stats['Audit events'] = a.rows[0].n;
  }

  return json(res, 200, {
    user: { username: user.username, fullName: user.full_name, email: user.email, role: user.role },
    abilities: {
      creatableRoles: rbac.creatableRoles(user.role),
      canDeleteInputters: rbac.canDeleteInputters(user.role),
      canViewAudit: rbac.canViewAudit(user.role),
      canRecover: rbac.canRecoverAccounts(user.role),
      seesAllRecords: rbac.canSeeAllRecords(user.role),
      canBackup: rbac.canBackup(user.role),
      canRestoreOrReset: rbac.canRestoreOrReset(user.role),
    },
    demoMode: demoMode(),
    stats,
  });
});
