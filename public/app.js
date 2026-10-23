'use strict';
// Novo Staff front end. Plain JavaScript, no framework.
// All text from the server is put on the page with textContent (never innerHTML),
// so nothing a user types can run as code (this blocks XSS).
// The only innerHTML is the QR code picture, which our own server draws.

const root = document.getElementById('root');
let ME = null;            // { user, abilities, stats, demoMode }
let idleTimer = null;

// ---------------------------------------------------------------- helpers
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v !== false && v !== null && v !== undefined) el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid === null || kid === undefined || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

async function api(path, method = 'GET', body) {
  const opts = { method, credentials: 'same-origin', headers: { 'X-Requested-With': 'novostaff' } };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(path, opts);
  let data = {};
  try { data = await res.json(); } catch (e) { /* not JSON */ }
  return { ok: res.ok, status: res.status, data };
}

function mount(node) { root.replaceChildren(node); }
function say(box, kind, text) { box.replaceChildren(text ? h('div', { class: 'msg ' + kind }, text) : ''); }
const fmt = (d) => new Date(d).toLocaleString();

// Wraps a form submit: disables the button while the request runs.
function submit(form, box, work) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    say(box, 'info', '');
    try { await work(Object.fromEntries(new FormData(form))); }
    catch (err) { say(box, 'error', 'Could not reach the server. Check your connection.'); }
    btn.disabled = false;
  });
}

// ---------------------------------------------------------------- sign-in screens
function authFrame(content) {
  return h('div', { class: 'auth' },
    h('section', { class: 'auth-art' },
      h('div', { class: 'brand' }, h('div', { class: 'brand-mark' }, 'N'), 'Novo Staff'),
      h('div', {},
        h('h1', {}, 'Records you can trust, access you control.'),
        h('p', {}, 'A secure staff records portal with two-factor sign-in and role-based access.'),
        h('ul', {},
          h('li', {}, 'Passwords protected with salt + pepper'),
          h('li', {}, 'Two-factor sign-in with an authenticator app'),
          h('li', {}, 'Records encrypted with AES-256-GCM'))),
      h('small', {}, 'Computer Security - PBIT 309 / PBSE 309')),
    h('main', { class: 'auth-main' }, h('div', { class: 'panel' }, content)));
}

function viewLogin(note) {
  const box = h('div');
  const form = h('form', { autocomplete: 'off' },
    h('label', { for: 'username' }, 'Username'),
    h('input', { id: 'username', name: 'username', required: true, maxlength: 50, autocomplete: 'username' }),
    h('label', { for: 'password' }, 'Password'),
    h('input', { id: 'password', name: 'password', type: 'password', required: true, autocomplete: 'current-password' }),
    h('button', { class: 'btn block', type: 'submit' }, 'Continue'));
  submit(form, box, async (f) => {
    const r = await api('/api/login', 'POST', f);
    if (r.ok) return viewTwoFactor();
    say(box, 'error', r.data.error || 'Sign-in failed.');
  });
  mount(authFrame([
    h('h2', {}, 'Welcome back'),
    h('p', { class: 'sub' }, 'Step 1 of 2: your username and password.'),
    note ? h('div', { class: 'msg info' }, note) : null, box, form]));
}

async function viewTwoFactor() {
  const r = await api('/api/twofactor');
  if (!r.ok) return viewLogin(r.data.error);
  const info = r.data;
  const box = h('div');
  const form = h('form', { autocomplete: 'off' },
    h('label', { for: 'code' }, '6-digit code'),
    h('input', { id: 'code', name: 'code', class: 'code-input', required: true, inputmode: 'numeric', pattern: '[0-9 ]{6,7}', maxlength: 7, autocomplete: 'one-time-code' }),
    h('button', { class: 'btn block', type: 'submit' }, info.enrolling ? 'Link device and sign in' : 'Verify and sign in'));
  submit(form, box, async (f) => {
    const res = await api('/api/twofactor', 'POST', f);
    if (res.ok) return boot();
    if (res.data.restart) return viewLogin(res.data.error);
    say(box, 'error', res.data.error || 'Verification failed.');
  });

  let setup = null;
  if (info.enrolling) {
    const qr = h('div', { class: 'qr' });
    qr.innerHTML = info.qr;                                   // picture drawn by our own server
    setup = [
      h('div', { class: 'msg info' }, 'First sign-in: scan this QR code with Google Authenticator, Microsoft Authenticator or Authy.'),
      qr,
      h('p', { class: 'sub' }, 'Cannot scan? Type this key into the app:'),
      h('div', { class: 'secret mono' }, info.secret),
    ];
  }
  mount(authFrame([
    h('h2', {}, 'Check your phone'),
    h('p', { class: 'sub' }, 'Step 2 of 2: ' + info.username + ', enter the code from your authenticator app.'),
    setup, box, form,
    h('button', { class: 'btn ghost block', onclick: () => viewLogin() }, 'Back to sign-in')]));
  document.getElementById('code').focus();
}

async function viewSetup() {
  const box = h('div');
  const form = h('form', { autocomplete: 'off' },
    h('label', {}, 'Setup token (from your Render settings)'), h('input', { name: 'token', type: 'password', required: true }),
    h('label', {}, 'Full name'), h('input', { name: 'full_name', required: true, maxlength: 100 }),
    h('label', {}, 'Username'), h('input', { name: 'username', required: true, maxlength: 30 }),
    h('label', {}, 'Email'), h('input', { name: 'email', type: 'email', required: true }),
    h('label', {}, 'Password (10+ characters, upper, lower, number, symbol)'), h('input', { name: 'password', type: 'password', required: true, autocomplete: 'new-password' }),
    h('button', { class: 'btn block', type: 'submit' }, 'Create the Administrator'));
  submit(form, box, async (f) => {
    const r = await api('/api/setup', 'POST', f);
    if (r.ok) return viewLogin('Administrator created. Sign in now and link your authenticator app.');
    say(box, 'error', r.data.error || 'Setup failed.');
  });
  mount(authFrame([
    h('h2', {}, 'First-time setup'),
    h('p', { class: 'sub' }, 'Create the first Administrator. This page closes for good once one account exists.'),
    box, form]));
}

// ---------------------------------------------------------------- signed-in shell
function resetIdle() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => logout('You were signed out after 15 minutes of inactivity.'), 15 * 60 * 1000);
}
['click', 'keydown'].forEach((ev) => document.addEventListener(ev, () => { if (ME) resetIdle(); }));

async function logout(note) {
  await api('/api/logout', 'POST', {}).catch(() => {});
  ME = null;
  clearTimeout(idleTimer);
  viewLogin(note);
}

function shell(active, title, subtitle, ...content) {
  const a = ME.abilities;
  const items = [['dashboard', 'Dashboard'], ['records', 'Records']];
  if (a.creatableRoles.length || a.canDeleteInputters) items.push(['users', 'Users']);
  if (a.canViewAudit) items.push(['audit', 'Audit log']);
  if (a.canViewAudit && ME.demoMode) items.push(['credentials', 'Salt & pepper']);
  items.push(['password', 'Change password']);

  const nav = items.map(([key, label]) =>
    h('button', { class: 'nav' + (key === active ? ' active' : ''), onclick: () => go(key) }, label));

  mount(h('div', { class: 'shell' },
    h('aside', { class: 'side' },
      h('div', { class: 'brand dark' }, h('div', { class: 'brand-mark' }, 'N'), 'Novo Staff'),
      nav, h('div', { class: 'spacer' }),
      h('button', { class: 'nav', onclick: () => logout() }, 'Sign out')),
    h('main', { class: 'main' },
      h('div', { class: 'top' },
        h('div', {}, h('h2', {}, title), h('p', {}, subtitle)),
        h('div', { class: 'chip' }, ME.user.fullName + ' - ', h('span', { class: 'role-tag' }, ME.user.role))),
      ME.demoMode ? h('div', { class: 'banner' }, 'Demo mode is ON: salt, pepper and their combination are visible in the database for the lecturer. Turn DEMO_MODE off after the demonstration.') : null,
      content)));
}

const views = { dashboard, records, users, audit, credentials, password };
function go(name) { resetIdle(); return views[name](); }

async function boot() {
  const s = await api('/api/setup');
  if (s.ok && s.data.open) return viewSetup();
  const r = await api('/api/me');
  if (!r.ok) return viewLogin();
  ME = r.data;
  resetIdle();
  return dashboard();
}

// ---------------------------------------------------------------- pages
const ABILITY_TEXT = {
  inputter: ['Add staff records', 'See and delete only your own records', 'Change your password'],
  manager: ['Add staff records and see everyone\'s', 'Create Inputter accounts', 'Delete only your own records'],
  admin: ['See every record and delete any of them', 'View and delete Inputter accounts', 'Cannot create accounts or read the audit log'],
  administrator: ['Full control of the system', 'Create Inputters, Managers and Admins', 'Unlock accounts, reset 2FA, read and manage the audit log'],
};

async function dashboard() {
  const r = await api('/api/me');
  if (!r.ok) return viewLogin('Please sign in again.');
  ME = r.data;
  shell('dashboard', 'Hello, ' + ME.user.fullName.split(' ')[0], 'Here is your workspace.',
    h('div', { class: 'grid' }, Object.entries(ME.stats).map(([k, v]) => h('div', { class: 'stat' }, h('b', {}, v), h('span', {}, k)))),
    h('div', { class: 'card' }, h('h3', {}, 'What your role (' + ME.user.role + ') can do'),
      h('ul', { class: 'bullets' }, (ABILITY_TEXT[ME.user.role] || []).map((t) => h('li', {}, t)))));
}

async function records() {
  const box = h('div');
  const list = h('div');
  const form = h('form', {},
    h('label', {}, 'Title'), h('input', { name: 'title', required: true, maxlength: 150 }),
    h('label', {}, 'Details (stored encrypted)'), h('textarea', { name: 'details', required: true, maxlength: 5000 }),
    h('button', { class: 'btn block', type: 'submit' }, 'Save record'));

  async function load() {
    const r = await api('/api/records');
    if (!r.ok) return viewLogin('Please sign in again.');
    list.replaceChildren(r.data.records.length ? r.data.records.map((rec) =>
      h('div', { class: 'record' },
        h('header', {}, h('b', {}, rec.title), h('small', {}, rec.fullName + ' - ' + fmt(rec.createdAt))),
        h('p', {}, rec.details),
        rec.canDelete ? h('div', { class: 'actions top-gap' },
          h('button', { class: 'btn danger small', onclick: async () => {
            if (!confirm('Delete this record?')) return;
            const d = await api('/api/records', 'POST', { action: 'delete', id: rec.id });
            say(box, d.ok ? 'ok' : 'error', d.ok ? 'Record deleted.' : d.data.error); load();
          } }, 'Delete')) : null)) : h('p', { class: 'empty' }, 'No records yet.'));
  }
  submit(form, box, async (f) => {
    const r = await api('/api/records', 'POST', f);
    say(box, r.ok ? 'ok' : 'error', r.ok ? 'Record saved (encrypted).' : r.data.error);
    if (r.ok) { form.reset(); load(); }
  });
  shell('records', 'Records', 'Details are encrypted with AES-256-GCM before they reach the database.',
    h('div', { class: 'two' }, h('div', { class: 'card' }, h('h3', {}, 'New record'), box, form),
      h('div', { class: 'card' }, h('h3', {}, 'Records you may see'), list)));
  load();
}

async function users() {
  const a = ME.abilities;
  const box = h('div');
  const tableHolder = h('div');

  let addCard = null;
  if (a.creatableRoles.length) {
    const form = h('form', { autocomplete: 'off' },
      h('label', {}, 'Full name'), h('input', { name: 'full_name', required: true, maxlength: 100 }),
      h('label', {}, 'Username'), h('input', { name: 'username', required: true, maxlength: 30 }),
      h('label', {}, 'Email'), h('input', { name: 'email', type: 'email', required: true }),
      h('label', {}, 'Role'), h('select', { name: 'role' }, a.creatableRoles.map((r) => h('option', { value: r }, r))),
      h('label', {}, 'Temporary password'), h('input', { name: 'password', type: 'password', required: true, autocomplete: 'new-password' }),
      h('button', { class: 'btn block', type: 'submit' }, 'Create account'));
    submit(form, box, async (f) => {
      const r = await api('/api/users', 'POST', { ...f, action: 'add' });
      say(box, r.ok ? 'ok' : 'error', r.ok ? r.data.message : r.data.error);
      if (r.ok) { form.reset(); loadTable(); }
    });
    addCard = h('div', { class: 'card' }, h('h3', {}, 'Add a user'), form);
  }

  async function act(action, u, question) {
    if (question && !confirm(question)) return;
    const r = await api('/api/users', 'POST', { action, id: u.id });
    say(box, r.ok ? 'ok' : 'error', r.ok ? r.data.message : r.data.error);
    loadTable();
  }

  async function loadTable() {
    if (!a.canDeleteInputters) return;
    const r = await api('/api/users');
    if (!r.ok) return;
    tableHolder.replaceChildren(h('div', { class: 'table-wrap' }, h('table', {},
      h('thead', {}, h('tr', {}, ['User', 'Role', '2FA', 'Status', ''].map((t) => h('th', {}, t)))),
      h('tbody', {}, r.data.users.map((u) => h('tr', {},
        h('td', {}, h('b', {}, u.full_name), h('br'), h('small', {}, u.username + ' - ' + u.email)),
        h('td', {}, h('span', { class: 'role-tag' }, u.role)),
        h('td', {}, u.totp_enabled ? 'On' : 'Not yet'),
        h('td', {}, u.is_locked ? 'Locked' : 'Active'),
        h('td', {}, h('div', { class: 'actions' },
          u.role === 'inputter' ? h('button', { class: 'btn danger small', onclick: () => act('delete', u, 'Delete inputter ' + u.username + '?') }, 'Delete') : null,
          a.canRecover && u.is_locked ? h('button', { class: 'btn ghost small', onclick: () => act('unlock', u) }, 'Unlock') : null,
          a.canRecover ? h('button', { class: 'btn ghost small', onclick: () => act('reset2fa', u, 'Reset 2FA for ' + u.username + '?') }, 'Reset 2FA') : null))))))));
  }

  shell('users', 'Users', a.canDeleteInputters ? 'Accounts you manage.' : 'Create accounts for your team.',
    box, addCard,
    a.canDeleteInputters ? h('div', { class: 'card' }, h('h3', {}, ME.user.role === 'administrator' ? 'All users' : 'Inputters'), tableHolder) : null);
  loadTable();
}

async function audit() {
  const box = h('div');
  const holder = h('div');
  async function load() {
    const r = await api('/api/audit');
    if (!r.ok) return;
    holder.replaceChildren(r.data.entries.length ? h('div', { class: 'table-wrap' }, h('table', {},
      h('thead', {}, h('tr', {}, ['When', 'User', 'Action', 'Detail', 'IP', ''].map((t) => h('th', {}, t)))),
      h('tbody', {}, r.data.entries.map((e) => h('tr', {},
        h('td', {}, fmt(e.created_at)), h('td', {}, e.username || '-'), h('td', {}, h('b', {}, e.action)),
        h('td', {}, e.detail || ''), h('td', { class: 'mono' }, e.ip_address || ''),
        h('td', {}, h('button', { class: 'btn ghost small', onclick: async () => {
          const d = await api('/api/audit', 'POST', { action: 'delete', id: e.id });
          say(box, d.ok ? 'ok' : 'error', d.ok ? d.data.message : d.data.error); load();
        } }, 'Delete'))))))) : h('p', { class: 'empty' }, 'The log is empty.'));
  }
  shell('audit', 'Audit log', 'Every sign-in, change and denied attempt. Clearing the log is itself logged.',
    box, h('div', { class: 'card' },
      h('div', { class: 'actions bottom-gap' },
        h('button', { class: 'btn danger small', onclick: async () => {
          if (!confirm('Clear the whole audit log?')) return;
          const d = await api('/api/audit', 'POST', { action: 'clear' });
          say(box, d.ok ? 'ok' : 'error', d.ok ? d.data.message : d.data.error); load();
        } }, 'Clear log'),
        h('button', { class: 'btn ghost small', onclick: load }, 'Refresh')),
      holder));
  load();
}

async function credentials() {
  const box = h('div');
  const table = h('div');
  const proof = h('div');
  const r = await api('/api/credentials');
  if (!r.ok) { return shell('credentials', 'Salt & pepper', '', h('div', { class: 'msg error' }, r.data.error || 'Not available.')); }

  table.replaceChildren(h('div', { class: 'table-wrap' }, h('table', {},
    h('thead', {}, h('tr', {}, ['User', 'Role', 'Salt (random, per user)', 'Pepper (same for all)', 'Salt + pepper', 'Stored hash'].map((t) => h('th', {}, t)))),
    h('tbody', {}, r.data.users.map((u) => h('tr', {},
      h('td', {}, h('b', {}, u.username)), h('td', {}, u.role),
      h('td', { class: 'wrap mono' }, u.salt), h('td', { class: 'wrap mono' }, u.pepper || '(hidden)'),
      h('td', { class: 'wrap mono' }, u.salt_pepper || '(hidden)'), h('td', { class: 'wrap mono' }, u.password_hash)))))));

  const form = h('form', { autocomplete: 'off' },
    h('label', {}, 'Username'), h('input', { name: 'username', required: true }),
    h('label', {}, 'Password to test'), h('input', { name: 'password', type: 'password', required: true }),
    h('button', { class: 'btn block', type: 'submit' }, 'Run the 4 steps'));
  submit(form, box, async (f) => {
    const d = await api('/api/credentials', 'POST', f);
    if (!d.ok) { proof.replaceChildren(); return say(box, 'error', d.data.error); }
    const s = d.data.steps;
    proof.replaceChildren(h('div', { class: 'steps' },
      step('STEP 1 - SALT (from the database)', s.salt),
      step('STEP 2 - PEPPER (from the environment)', s.pepper),
      step('STEP 3 - SALT + PEPPER joined', s.saltPepper),
      step('STEP 4 - HASH = PBKDF2-SHA256(password, salt+pepper, ' + d.data.rounds + ' rounds)', s.computed),
      step('Hash stored in the database', s.stored),
      h('div', { class: 'msg ' + (d.data.match ? 'ok' : 'error') }, d.data.match ? 'MATCH: the password is correct.' : 'NO MATCH: the password is wrong.')));
  });

  shell('credentials', 'Salt & pepper', 'The proof for every user: what is stored and how a login is checked.',
    h('div', { class: 'card' }, h('h3', {}, 'What the database holds for every user'), table),
    h('div', { class: 'card' }, h('h3', {}, 'Watch a login being checked'), box, form, proof));
}
const step = (label, value) => h('div', { class: 'step' }, h('b', {}, label), h('span', { class: 'mono breakall' }, value));

async function password() {
  const box = h('div');
  const form = h('form', { autocomplete: 'off' },
    h('label', {}, 'Current password'), h('input', { name: 'current', type: 'password', required: true, autocomplete: 'current-password' }),
    h('label', {}, 'New password'), h('input', { name: 'new', type: 'password', required: true, autocomplete: 'new-password' }),
    h('label', {}, 'Repeat new password'), h('input', { name: 'confirm', type: 'password', required: true, autocomplete: 'new-password' }),
    h('button', { class: 'btn block', type: 'submit' }, 'Change password'));
  submit(form, box, async (f) => {
    const r = await api('/api/password', 'POST', f);
    say(box, r.ok ? 'ok' : 'error', r.ok ? r.data.message : r.data.error);
    if (r.ok) form.reset();
    if (r.status === 429) logout(r.data.error);
  });
  shell('password', 'Change password', 'A new salt is generated every time you change it.',
    h('div', { class: 'card narrow' }, box, form,
      h('p', { class: 'hint' }, 'Rule: 10+ characters with an uppercase letter, a lowercase letter, a number and a symbol.')));
}

boot().catch(() => viewLogin('Could not reach the server.'));

// Lets the site install like an app (Add to Home screen / Install app).
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
