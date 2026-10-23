function Save-File {
    param([Parameter(Mandatory)][string]$Path, [Parameter(Mandatory)][string]$Content)
    $full = if ([IO.Path]::IsPathRooted($Path)) { $Path } else { Join-Path (Get-Location).Path $Path }
    $dir = Split-Path $full -Parent
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    $text = ($Content -replace "`r`n", "`n").TrimEnd("`n") + "`n"
    [IO.File]::WriteAllText($full, $text, (New-Object Text.UTF8Encoding $false))
    $bytes = [IO.File]::ReadAllBytes($full).Length
    Write-Host ("saved  {0}  ({1} bytes)" -f $Path, $bytes) -ForegroundColor Green
}

Set-Location C:\novo-staff
Write-Host ("You are in: " + (Get-Location).Path) -ForegroundColor Cyan

Save-File "lib\rbac.js" @'
'use strict';
// Role-based access control (RBAC): permissions belong to roles.
// Every API route checks these on the SERVER. Hiding a button is not security.

// Which roles each role is allowed to create.
function creatableRoles(role) {
  if (role === 'manager') return ['inputter'];
  if (role === 'administrator') return ['inputter', 'manager', 'admin'];
  return [];
}

const canDeleteInputters = (role) => role === 'admin' || role === 'administrator';
const canDeleteAnyRecord = (role) => role === 'admin' || role === 'administrator';
const canSeeAllRecords = (role) => role !== 'inputter';
const canViewAudit = (role) => role === 'administrator';
const canRecoverAccounts = (role) => role === 'administrator';   // unlock + reset 2FA
const canBackup = (role) => role === 'manager' || role === 'admin' || role === 'administrator';
const canRestoreOrReset = (role) => role === 'administrator';    // restore records, reset the system

module.exports = {
  creatableRoles,
  canDeleteInputters,
  canDeleteAnyRecord,
  canSeeAllRecords,
  canViewAudit,
  canRecoverAccounts,
  canBackup,
  canRestoreOrReset,
};
'@

Save-File "api\me.js" @'
'use strict';
// Who am I? Returns the signed-in user, what their role may do, and dashboard numbers.

const db = require('../lib/db');
const { route, json } = require('../lib/http');
const rbac = require('../lib/rbac');
const { demoMode } = require('../lib/security');

module.exports = route({ methods: ['GET'] }, async ({ res, user }) => {
  const stats = {};

  const mine = await db.query('select count(*)::int as n from records where user_id = $1', [user.id]);
  stats['My records'] = mine.rows[0].n;

  if (rbac.canSeeAllRecords(user.role)) {
    const all = await db.query('select count(*)::int as n from records');
    stats['All records'] = all.rows[0].n;
  }
  if (user.role !== 'inputter') {
    const r = await db.query("select count(*)::int as n from users u join roles r on r.id = u.role_id where r.name = 'inputter'");
    stats['Inputters'] = r.rows[0].n;
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
'@

Save-File "api\backups.js" @'
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
    return json(res, 201, { ok: true, backup: snap, message: 'Backup #' + snap.id + ' saved: ' + snap.users + ' users and ' + snap.records + ' records.' });
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
    return json(res, 200, { ok: true, message: 'System reset: ' + del.rowCount + ' records removed. Accounts and settings were not changed. Safety backup #' + safety.id + ' was saved first.' });
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
  return json(res, 200, { ok: true, message: 'Restored ' + done.rowCount + ' records from backup #' + id + (skipped ? ' (' + skipped + ' skipped because their owner no longer exists)' : '') + '. Accounts and settings were not changed. Safety backup #' + safety.id + ' was saved first.' });
});
'@

Save-File "schema.sql" @'
-- =====================================================================
--  Novo Staff database (PostgreSQL on AWS RDS)
--  Run with:  node scripts/run-sql.js schema.sql
--  It is safe to run more than once.
-- =====================================================================

create table if not exists roles (
  id   smallint primary key,
  name text not null unique
);

insert into roles (id, name) values
  (1, 'inputter'), (2, 'manager'), (3, 'admin'), (4, 'administrator')
on conflict (id) do nothing;

create table if not exists users (
  id              serial primary key,
  username        varchar(50)  not null unique,        -- identification
  full_name       varchar(100) not null,
  email           varchar(120) not null unique,
  password_hash   varchar(255) not null,               -- STEP 4: the final hash (PBKDF2)
  salt            varchar(64)  not null,               -- STEP 1: random, different per user
  pepper          varchar(128),                        -- STEP 2: copy of the pepper (demo mode only)
  salt_pepper     varchar(255),                        -- STEP 3: salt + pepper joined (demo mode only)
  role_id         smallint not null references roles(id),
  totp_secret     text,                                -- 2FA secret, stored encrypted (AES-256-GCM)
  totp_enabled    boolean not null default false,
  last_totp_step  integer not null default 0,          -- stops a 2FA code being used twice
  failed_attempts smallint not null default 0,
  locked_until    timestamptz,
  session_version integer not null default 0,          -- raising it signs the user out everywhere
  created_by      integer references users(id) on delete set null,
  created_at      timestamptz not null default now()
);

create table if not exists records (
  id         serial primary key,
  user_id    integer not null references users(id) on delete cascade,
  title      varchar(150) not null,
  details    text not null,                            -- stored encrypted (AES-256-GCM)
  created_at timestamptz not null default now()
);

create table if not exists audit_log (
  id         serial primary key,
  user_id    integer,
  username   varchar(50),
  action     varchar(60) not null,
  detail     varchar(255),
  ip_address varchar(45),
  created_at timestamptz not null default now()
);

-- Backups: a snapshot of the users and records, stored ENCRYPTED (AES-256-GCM)
-- in the data column. Nobody can read a snapshot without the ENC_KEY setting.
create table if not exists backups (
  id              serial primary key,
  created_at      timestamptz not null default now(),
  created_by      integer references users(id) on delete set null,
  created_by_name varchar(50),
  kind            varchar(30) not null,                -- manual | auto before restore | auto before reset
  users_count     integer not null,
  records_count   integer not null,
  data            text not null                        -- encrypted snapshot
);

-- The first Administrator is created by the website's /setup page, not here,
-- so no default password ever exists.
'@

Save-File "least_privilege.sql" @'
-- =====================================================================
--  A limited database account for the website (least privilege).
--  Run with:  node scripts/run-sql.js least_privilege.sql
--  (the password comes from the NOVO_APP_PASSWORD environment variable,
--   so it is never written in a file).
--  This account can ONLY read/write the 5 Novo Staff tables. It cannot
--  create, drop or change tables, so a bug cannot damage the structure.
-- =====================================================================
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'novostaff_app') then
    create role novostaff_app login password '__APP_PASSWORD__';
  else
    alter role novostaff_app login password '__APP_PASSWORD__';
  end if;
end $$;

grant usage on schema public to novostaff_app;
grant select on roles to novostaff_app;
grant select, insert, update, delete on users, records, audit_log to novostaff_app;
grant select, insert, delete on backups to novostaff_app;   -- snapshots are never edited
grant usage, select on all sequences in schema public to novostaff_app;
'@

Save-File "public\sw.js" @'
'use strict';
// Service worker: lets Novo Staff install like an app and open its screens
// quickly. It stores ONLY the page files (HTML, CSS, JS, icons).
// It never stores anything from /api, so no staff data is kept on the phone.
const CACHE = 'novo-staff-shell-v2';
const SHELL = ['/', '/style.css', '/app.js', '/favicon.svg', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  // Network first (always the newest version), the saved copy only when offline.
  event.respondWith(
    fetch(event.request).then((res) => {
      const copy = res.clone();
      if (res.ok) caches.open(CACHE).then((c) => c.put(event.request, copy));
      return res;
    }).catch(() => caches.match(event.request).then((hit) => hit || caches.match('/')))
  );
});
'@

Save-File "public\style.css" @'
/* Novo Staff: warm cream, coral and violet. No dark, lifeless panels. */
:root {
  --coral: #ff7a59;
  --violet: #7c5cfc;
  --ink: #2a2342;
  --muted: #6f6989;
  --cream: #fff8f1;
  --card: #ffffff;
  --line: #eee6f7;
  --ok: #1f9d6b;
  --bad: #d6455d;
  --radius: 16px;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: 'Plus Jakarta Sans', system-ui, -apple-system, 'Segoe UI', sans-serif;
  color: var(--ink);
  background: var(--cream);
  line-height: 1.55;
  min-height: 100vh;
}
h1, h2, h3 { line-height: 1.2; }
button, input, select, textarea { font: inherit; color: inherit; }
code, .mono { font-family: ui-monospace, Consolas, monospace; font-size: .86em; }

/* ---------- sign-in layout ---------- */
.auth { display: grid; grid-template-columns: 1.1fr 1fr; min-height: 100vh; }
.auth-art {
  background: linear-gradient(145deg, var(--coral), var(--violet));
  color: #fff; padding: 48px; display: flex; flex-direction: column; justify-content: space-between;
}
.auth-art h1 { font-size: 2.4rem; margin-bottom: 14px; max-width: 14ch; }
.auth-art p { opacity: .92; max-width: 40ch; }
.auth-art ul { list-style: none; margin-top: 26px; display: grid; gap: 10px; }
.auth-art li { background: rgba(255,255,255,.16); padding: 10px 14px; border-radius: 12px; font-size: .93rem; }
.auth-main { display: grid; place-items: center; padding: 32px 20px; }
.panel { width: 100%; max-width: 410px; }
.panel h2 { font-size: 1.7rem; margin-bottom: 6px; }
.panel .sub { color: var(--muted); margin-bottom: 22px; }
.brand { display: flex; align-items: center; gap: 10px; font-weight: 800; font-size: 1.15rem; }
.brand-mark {
  width: 36px; height: 36px; border-radius: 11px; display: grid; place-items: center;
  background: #fff; color: var(--violet); font-weight: 800;
}
.brand.dark .brand-mark { background: linear-gradient(145deg, var(--coral), var(--violet)); color: #fff; }

/* ---------- forms ---------- */
label { display: block; font-weight: 600; font-size: .86rem; margin: 14px 0 6px; }
input, select, textarea {
  width: 100%; padding: 12px 14px; border: 1.5px solid var(--line); border-radius: 12px;
  background: #fff; outline: none; transition: border-color .15s, box-shadow .15s;
}
input:focus, select:focus, textarea:focus { border-color: var(--violet); box-shadow: 0 0 0 4px rgba(124,92,252,.14); }
textarea { min-height: 110px; resize: vertical; }
.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px; cursor: pointer;
  border: 0; border-radius: 12px; padding: 12px 20px; font-weight: 700; color: #fff;
  background: linear-gradient(135deg, var(--coral), var(--violet)); transition: transform .12s, opacity .12s;
}
.btn:hover { transform: translateY(-1px); }
.btn:disabled { opacity: .6; cursor: wait; transform: none; }
.btn.block { width: 100%; margin-top: 20px; }
.btn.ghost { background: #fff; color: var(--ink); border: 1.5px solid var(--line); }
.btn.danger { background: var(--bad); }
.btn.small { padding: 7px 12px; font-size: .82rem; border-radius: 10px; }
.code-input { text-align: center; font-size: 1.7rem; letter-spacing: .45em; font-family: ui-monospace, Consolas, monospace; }

.msg { padding: 11px 14px; border-radius: 12px; font-size: .9rem; margin-bottom: 14px; }
.msg.error { background: #ffe9ed; color: #8d1f33; }
.msg.ok { background: #e3f7ee; color: #14664a; }
.msg.info { background: #efeaff; color: #4a35b8; }

/* ---------- app shell ---------- */
.shell { display: grid; grid-template-columns: 250px 1fr; min-height: 100vh; }
.side { background: #fff; border-right: 1px solid var(--line); padding: 24px 16px; display: flex; flex-direction: column; gap: 6px; position: sticky; top: 0; height: 100vh; }
.side .brand { margin: 0 8px 22px; }
.nav { display: flex; align-items: center; gap: 10px; padding: 11px 14px; border-radius: 12px; border: 0; background: none; cursor: pointer; text-align: left; font-weight: 600; color: var(--muted); width: 100%; }
.nav:hover { background: #f6f1ff; color: var(--ink); }
.nav.active { background: linear-gradient(135deg, rgba(255,122,89,.14), rgba(124,92,252,.16)); color: var(--ink); }
.spacer { flex: 1; }
.main { padding: 32px clamp(18px, 4vw, 44px); max-width: 1100px; width: 100%; }
.top { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 26px; flex-wrap: wrap; }
.top h2 { font-size: 1.8rem; }
.top p { color: var(--muted); }
.chip { background: #fff; border: 1px solid var(--line); border-radius: 999px; padding: 8px 14px; font-size: .86rem; font-weight: 600; }
.role-tag { display: inline-block; padding: 3px 10px; border-radius: 999px; font-size: .75rem; font-weight: 700; background: #efeaff; color: #4a35b8; text-transform: capitalize; }
.card { background: var(--card); border: 1px solid var(--line); border-radius: var(--radius); padding: 22px; margin-bottom: 20px; box-shadow: 0 6px 22px rgba(124,92,252,.06); }
.card h3 { margin-bottom: 12px; font-size: 1.05rem; }
.grid { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); margin-bottom: 20px; }
.stat { background: #fff; border: 1px solid var(--line); border-radius: var(--radius); padding: 18px; }
.stat b { display: block; font-size: 2rem; background: linear-gradient(135deg, var(--coral), var(--violet)); -webkit-background-clip: text; background-clip: text; color: transparent; }
.stat span { color: var(--muted); font-size: .86rem; font-weight: 600; }
.two { display: grid; gap: 20px; grid-template-columns: 1fr 1fr; align-items: start; }
.table-wrap { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; font-size: .88rem; }
th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--line); vertical-align: top; }
th { color: var(--muted); font-size: .76rem; text-transform: uppercase; letter-spacing: .05em; }
td.wrap { word-break: break-all; max-width: 280px; }
.actions { display: flex; gap: 6px; flex-wrap: wrap; }
.record { border: 1px solid var(--line); border-radius: 14px; padding: 14px 16px; margin-bottom: 12px; }
.record header { display: flex; justify-content: space-between; gap: 10px; align-items: baseline; }
.record small { color: var(--muted); }
.record p { margin-top: 6px; white-space: pre-wrap; }
.steps { display: grid; gap: 10px; margin-top: 14px; }
.step { border-left: 4px solid var(--violet); background: #faf7ff; padding: 10px 14px; border-radius: 0 12px 12px 0; }
.step b { display: block; font-size: .8rem; color: var(--violet); margin-bottom: 2px; }
.qr { display: grid; place-items: center; background: #fff; border: 1px solid var(--line); border-radius: 14px; padding: 10px; margin: 8px 0 14px; }
.secret { background: #faf7ff; border-radius: 10px; padding: 8px 12px; word-break: break-all; text-align: center; }
.banner { background: #fff3cd; color: #6b5200; padding: 10px 16px; border-radius: 12px; margin-bottom: 20px; font-size: .88rem; }
.empty { color: var(--muted); padding: 10px 2px; }

@media (max-width: 860px) {
  .auth { grid-template-columns: 1fr; }
  .auth-art { padding: 28px; min-height: 0; gap: 22px; }
  .auth-art h1 { font-size: 1.8rem; }
  .shell { grid-template-columns: 1fr; }
  .side { position: static; height: auto; flex-direction: row; flex-wrap: wrap; padding: 12px; }
  .side .brand { width: 100%; margin: 0 4px 6px; }
  .spacer { display: none; }
  .two { grid-template-columns: 1fr; }
}

.bullets { padding-left: 20px; display: grid; gap: 6px; }
.top-gap { margin-top: 10px; }
.bottom-gap { margin-bottom: 12px; }
.breakall { word-break: break-all; }
.narrow { max-width: 480px; }
.hint { margin-top: 14px; color: var(--muted); font-size: .85rem; }

/* ---------- show / hide password ---------- */
.pw-wrap { position: relative; }
.pw-wrap input { padding-right: 74px; }
.pw-toggle {
  position: absolute; right: 8px; top: 50%; transform: translateY(-50%);
  border: 0; background: none; cursor: pointer; padding: 6px 10px;
  color: var(--violet); font-weight: 700; font-size: .82rem; border-radius: 8px;
}
.pw-toggle:hover { background: #f1ecff; }
.danger-zone { border-color: #f3c3cb; }
'@
