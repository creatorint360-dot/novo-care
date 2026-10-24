'use strict';
// Front end. Plain JavaScript, no framework.
// All text from the server is put on the page with textContent (never innerHTML),
// so nothing a user types can run as code (this blocks XSS).
// The only innerHTML is the QR code picture, which our own server draws.

const root = document.getElementById('root');
let ME = null;            // { user, abilities, stats, demoMode }
let idleTimer = null;

// The words the system uses (what a "record" is called, what each role is called).
// They come from the server (/api/labels), so one setting re-labels everything.
// This copy is used only if the server cannot be reached for a moment.
let L = {
  appName: 'Novo Care', tagline: 'Patient records you can trust, access you control.',
  intro: 'A secure patient records portal with two-factor sign-in and role-based access.',
  pills: ['Passwords protected with salt + pepper', 'Two-factor sign-in with an authenticator app', 'Patient notes encrypted with AES-256-GCM'],
  record: 'patient note', records: 'patient notes', Record: 'Patient note', Records: 'Patient notes',
  titleLabel: 'Patient (name or number)', detailsLabel: 'Clinical notes (stored encrypted)',
  roles: { inputter: 'Nurse', manager: 'Doctor', admin: 'Records officer', administrator: 'Administrator' },
  rolePlurals: { inputter: 'Nurses', manager: 'Doctors', admin: 'Records officers', administrator: 'Administrators' },
  abilities: {},
};
const roleName = (role) => (L.roles && L.roles[role]) || role;

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

// A password box with a Show / Hide button, so people can check what they typed.
function pwInput(attrs) {
  const input = h('input', { type: 'password', required: true, ...attrs });
  const btn = h('button', { class: 'pw-toggle', type: 'button', 'aria-label': 'Show password' }, 'Show');
  btn.addEventListener('click', () => {
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    btn.textContent = show ? 'Hide' : 'Show';
    btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  });
  return h('div', { class: 'pw-wrap' }, input, btn);
}

// Browsers like to pre-fill saved logins. These boxes start read-only and unlock when
// touched, which stops that, so the sign-in screen always opens empty.
function noAutofill(input) {
  input.setAttribute('readonly', '');
  const unlock = () => input.removeAttribute('readonly');
  input.addEventListener('focus', unlock);
  input.addEventListener('pointerdown', unlock);
  return input;
}

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
      h('div', { class: 'brand' }, h('div', { class: 'brand-mark' }, 'N'), L.appName),
      h('div', {},
        h('h1', {}, L.tagline),
        h('p', {}, L.intro),
        h('ul', {}, L.pills.map((t) => h('li', {}, t))),
        h('a', { class: 'report-link', href: '/report' }, 'Read the project report')),
      h('small', {}, 'Computer Security - PBIT 309 / PBSE 309')),
    h('main', { class: 'auth-main' }, h('div', { class: 'panel' }, content)));
}

function viewLogin(note) {
  const box = h('div');
  const form = h('form', { autocomplete: 'off' },
    h('label', { for: 'username' }, 'Username'),
    noAutofill(h('input', { id: 'username', name: 'username', required: true, maxlength: 50, autocomplete: 'off', autocapitalize: 'none', spellcheck: 'false' })),
    h('label', { for: 'password' }, 'Password'),
    pwInput({ id: 'password', name: 'password', autocomplete: 'new-password' }),
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
    h('label', {}, 'Setup token (from your Render settings)'), pwInput({ name: 'token', autocomplete: 'off' }),
    h('label', {}, 'Full name'), h('input', { name: 'full_name', required: true, maxlength: 100 }),
    h('label', {}, 'Username'), h('input', { name: 'username', required: true, maxlength: 30 }),
    h('label', {}, 'Email'), h('input', { name: 'email', type: 'email', required: true }),
    h('label', {}, 'Password (10+ characters, upper, lower, number, symbol)'), pwInput({ name: 'password', autocomplete: 'new-password' }),
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
  const items = [['dashboard', 'Dashboard'], ['records', L.Records]];
  if (a.creatableRoles.length || a.canDeleteInputters) items.push(['users', 'Users']);
  if (a.canViewAudit) items.push(['audit', 'Audit log']);
  if (a.canBackup) items.push(['backups', 'Backup']);
  if (a.canViewAudit && ME.demoMode) items.push(['credentials', 'Salt & pepper']);
  items.push(['password', 'Change password']);

  const nav = items.map(([key, label]) =>
    h('button', { class: 'nav' + (key === active ? ' active' : ''), onclick: () => go(key) }, label));

  mount(h('div', { class: 'shell' },
    h('aside', { class: 'side' },
      h('div', { class: 'brand dark' }, h('div', { class: 'brand-mark' }, 'N'), L.appName),
      nav, h('div', { class: 'spacer' }),
      h('button', { class: 'nav', onclick: () => logout() }, 'Sign out')),
    h('main', { class: 'main' },
      h('div', { class: 'top' },
        h('div', {}, h('h2', {}, title), h('p', {}, subtitle)),
        h('div', { class: 'chip' }, ME.user.fullName + ' - ', h('span', { class: 'role-tag' }, roleName(ME.user.role)))),
      ME.demoMode ? h('div', { class: 'banner' }, 'Demo mode is ON: salt, pepper and their combination are visible in the database for the lecturer. Turn DEMO_MODE off after the demonstration.') : null,
      content)));
}

const views = { dashboard, records, users, audit, backups, credentials, password };
function go(name) { resetIdle(); return views[name](); }

async function boot() {
  const lr = await api('/api/labels');
  if (lr.ok && lr.data.roles) L = lr.data;
  document.title = L.appName;
  const s = await api('/api/setup');
  if (s.ok && s.data.open) return viewSetup();
  const r = await api('/api/me');
  if (!r.ok) return viewLogin();
  ME = r.data;
  resetIdle();
  return dashboard();
}

// ---------------------------------------------------------------- pages

async function dashboard() {
  const r = await api('/api/me');
  if (!r.ok) return viewLogin('Please sign in again.');
  ME = r.data;
  shell('dashboard', 'Hello, ' + ME.user.fullName.split(' ')[0], 'Here is your workspace.',
    h('div', { class: 'grid' }, Object.entries(ME.stats).map(([k, v]) => h('div', { class: 'stat' }, h('b', {}, v), h('span', {}, k)))),
    h('div', { class: 'card' }, h('h3', {}, 'What your role (' + roleName(ME.user.role) + ') can do'),
      h('ul', { class: 'bullets' }, ((L.abilities && L.abilities[ME.user.role]) || []).map((t) => h('li', {}, t)))));
}

async function records() {
  const box = h('div');
  const list = h('div');
  const form = h('form', {},
    h('label', {}, L.titleLabel), h('input', { name: 'title', required: true, maxlength: 150 }),
    h('label', {}, L.detailsLabel), h('textarea', { name: 'details', required: true, maxlength: 5000 }),
    h('button', { class: 'btn block', type: 'submit' }, 'Save ' + L.record));

  async function load() {
    const r = await api('/api/records');
    if (!r.ok) return viewLogin('Please sign in again.');
    list.replaceChildren(...(r.data.records.length ? r.data.records.map((rec) =>
      h('div', { class: 'record' },
        h('header', {}, h('b', {}, rec.title), h('small', {}, rec.fullName + ' - ' + fmt(rec.createdAt))),
        h('p', {}, rec.details),
        rec.canDelete ? h('div', { class: 'actions top-gap' },
          h('button', { class: 'btn danger small', onclick: async () => {
            if (!confirm('Delete this ' + L.record + '?')) return;
            const d = await api('/api/records', 'POST', { action: 'delete', id: rec.id });
            say(box, d.ok ? 'ok' : 'error', d.ok ? L.Record + ' deleted.' : d.data.error); load();
          } }, 'Delete')) : null)) : [h('p', { class: 'empty' }, 'No ' + L.records + ' yet.')]));
  }
  submit(form, box, async (f) => {
    const r = await api('/api/records', 'POST', f);
    say(box, r.ok ? 'ok' : 'error', r.ok ? L.Record + ' saved (encrypted).' : r.data.error);
    if (r.ok) { form.reset(); load(); }
  });
  shell('records', L.Records, 'Details are encrypted with AES-256-GCM before they reach the database.',
    h('div', { class: 'two' }, h('div', { class: 'card' }, h('h3', {}, 'New ' + L.record), box, form),
      h('div', { class: 'card' }, h('h3', {}, L.Records + ' you may see'), list)));
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
      h('label', {}, 'Role'), h('select', { name: 'role' }, a.creatableRoles.map((r) => h('option', { value: r }, roleName(r)))),
      h('label', {}, 'Temporary password'), pwInput({ name: 'password', autocomplete: 'new-password' }),
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
        h('td', {}, h('span', { class: 'role-tag' }, roleName(u.role))),
        h('td', {}, u.totp_enabled ? 'On' : 'Not yet'),
        h('td', {}, u.is_locked ? 'Locked' : 'Active'),
        h('td', {}, h('div', { class: 'actions' },
          u.role === 'inputter' ? h('button', { class: 'btn danger small', onclick: () => act('delete', u, 'Delete ' + roleName('inputter') + ' ' + u.username + '?') }, 'Delete') : null,
          a.canRecover && u.is_locked ? h('button', { class: 'btn ghost small', onclick: () => act('unlock', u) }, 'Unlock') : null,
          a.canRecover ? h('button', { class: 'btn ghost small', onclick: () => act('reset2fa', u, 'Reset 2FA for ' + u.username + '?') }, 'Reset 2FA') : null))))))));
  }

  shell('users', 'Users', a.canDeleteInputters ? 'Accounts you manage.' : 'Create accounts for your team.',
    box, addCard,
    a.canDeleteInputters ? h('div', { class: 'card' }, h('h3', {}, ME.user.role === 'administrator' ? 'All users' : L.rolePlurals.inputter), tableHolder) : null);
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
      h('td', {}, h('b', {}, u.username)), h('td', {}, roleName(u.role)),
      h('td', { class: 'wrap mono' }, u.salt), h('td', { class: 'wrap mono' }, u.pepper || '(hidden)'),
      h('td', { class: 'wrap mono' }, u.salt_pepper || '(hidden)'), h('td', { class: 'wrap mono' }, u.password_hash)))))));

  const form = h('form', { autocomplete: 'off' },
    h('label', {}, 'Username'), h('input', { name: 'username', required: true }),
    h('label', {}, 'Password to test'), pwInput({ name: 'password', autocomplete: 'off' }),
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

async function backups() {
  const a = ME.abilities;
  const box = h('div');
  const tableHolder = h('div');
  const confirmHolder = h('div');

  async function load() {
    const r = await api('/api/backups');
    if (!r.ok) return say(box, 'error', r.data.error || 'Could not load the backups.');
    if (!r.data.backups.length) return tableHolder.replaceChildren(h('p', { class: 'empty' }, 'No backups yet. Press "Back up now".'));
    tableHolder.replaceChildren(h('div', { class: 'table-wrap' }, h('table', {},
      h('thead', {}, h('tr', {}, ['#', 'When', 'By', 'Type', 'Users', L.Records, ''].map((t) => h('th', {}, t)))),
      h('tbody', {}, r.data.backups.map((b) => h('tr', {},
        h('td', {}, b.id), h('td', {}, fmt(b.createdAt)), h('td', {}, b.by || '-'),
        h('td', {}, b.kind), h('td', {}, b.users), h('td', {}, b.records),
        h('td', {}, a.canRestoreOrReset ? h('button', { class: 'btn ghost small', onclick: () => askRestore(b) }, 'Restore') : null)))))));
  }

  // Restore and Reset both ask for the Administrator's password again.
  function askRestore(b) {
    const msg = h('div');
    const form = h('form', { autocomplete: 'off' },
      h('label', {}, 'Your password (to confirm)'), pwInput({ name: 'password', autocomplete: 'off' }),
      h('div', { class: 'actions top-gap' },
        h('button', { class: 'btn danger', type: 'submit' }, 'Restore backup #' + b.id),
        h('button', { class: 'btn ghost', type: 'button', onclick: () => confirmHolder.replaceChildren() }, 'Cancel')));
    submit(form, msg, async (f) => {
      const r = await api('/api/backups', 'POST', { action: 'restore', id: b.id, password: f.password });
      if (!r.ok) return say(msg, 'error', r.data.error || 'Restore failed.');
      confirmHolder.replaceChildren();
      say(box, 'ok', r.data.message);
      load();
    });
    confirmHolder.replaceChildren(h('div', { class: 'card' },
      h('h3', {}, 'Restore backup #' + b.id + '?'),
      h('p', { class: 'bottom-gap' }, 'The current ' + L.records + ' are replaced by the ' + L.records + ' in this backup (' + b.records + '). A safety backup is taken first. Accounts, passwords, 2FA and settings are not changed.'),
      msg, form));
    confirmHolder.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  const backupBtn = h('button', { class: 'btn', type: 'button' }, 'Back up now');
  backupBtn.addEventListener('click', async () => {
    backupBtn.disabled = true;
    try {
      const r = await api('/api/backups', 'POST', { action: 'create' });
      say(box, r.ok ? 'ok' : 'error', r.ok ? r.data.message : (r.data.error || 'Backup failed.'));
      if (r.ok) load();
    } catch (e) { say(box, 'error', 'Could not reach the server. Check your connection.'); }
    backupBtn.disabled = false;
  });

  let resetCard = null;
  if (a.canRestoreOrReset) {
    const msg = h('div');
    const form = h('form', { autocomplete: 'off' },
      h('label', {}, 'Type RESET in capital letters'), h('input', { name: 'confirm', required: true, autocomplete: 'off' }),
      h('label', {}, 'Your password'), pwInput({ name: 'password', autocomplete: 'off' }),
      h('button', { class: 'btn danger block', type: 'submit' }, 'Reset ' + L.records + ' (keep settings)'));
    submit(form, msg, async (f) => {
      if (!confirm('Delete ALL ' + L.records + ' now? A safety backup is taken first.')) return;
      const r = await api('/api/backups', 'POST', { action: 'reset', confirm: f.confirm, password: f.password });
      if (!r.ok) return say(msg, 'error', r.data.error || 'Reset failed.');
      form.reset();
      say(msg, '', '');
      say(box, 'ok', r.data.message);
      load();
    });
    resetCard = h('div', { class: 'card danger-zone' },
      h('h3', {}, 'Reset (Administrator only)'),
      h('p', { class: 'bottom-gap' }, 'Empties all ' + L.records + ' so you can start again. Accounts, roles, passwords, two-factor devices and every setting stay exactly as they are. A safety backup is saved first, so Restore can bring the ' + L.records + ' back.'),
      msg, form);
  }

  shell('backups', 'Backup', a.canRestoreOrReset ? 'Save, restore or reset the ' + L.records + '.' : 'Save a copy of the data.',
    box,
    h('div', { class: 'card' }, h('h3', {}, 'Back up now'),
      h('p', { class: 'bottom-gap' }, 'Saves an encrypted copy (AES-256-GCM) of the users and ' + L.records + '. Nobody can read it without the system key. The newest 20 backups are kept.'),
      backupBtn),
    confirmHolder,
    h('div', { class: 'card' }, h('h3', {}, 'Saved backups'), tableHolder),
    resetCard);
  load();
}

async function password() {
  const box = h('div');
  const form = h('form', { autocomplete: 'off' },
    h('label', {}, 'Current password'), pwInput({ name: 'current', autocomplete: 'current-password' }),
    h('label', {}, 'New password'), pwInput({ name: 'new', autocomplete: 'new-password' }),
    h('label', {}, 'Repeat new password'), pwInput({ name: 'confirm', autocomplete: 'new-password' }),
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
