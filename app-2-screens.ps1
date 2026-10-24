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

Set-Location C:\novo-staff-mobile
Write-Host ("You are in: " + (Get-Location).Path) -ForegroundColor Cyan

Save-File "src\screens.js" @'
// The app's screens. They call the same server as the website, so the role rules
// (who may see, add, delete, back up, reset) are enforced by the SERVER, not by the app.
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { api } from './api';
import { Body, Button, Card, Chip, Field, Msg, Muted, PasswordField, RoleTag, C, confirmAction, fmt } from './ui';

const ABILITY_TEXT = {
  inputter: ['Add staff records', 'See and delete only your own records', 'Change your password'],
  manager: ["Add staff records and see everyone's", 'Create Inputter accounts', 'Back up the data', 'Delete only your own records'],
  admin: ['See every record and delete any of them', 'View and delete Inputter accounts', 'Back up the data', 'Cannot create accounts or read the audit log'],
  administrator: ['Full control of the system', 'Create Inputters, Managers and Admins', 'Unlock accounts, reset 2FA, read the audit log', 'Back up, restore and reset the records'],
};

// ------------------------------------------------------------------ dashboard
export function Dashboard({ me, refresh }) {
  useEffect(() => { refresh(); }, []);
  return (
    <View>
      <Muted style={{ marginBottom: 12 }}>Here is your workspace.</Muted>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -6 }}>
        {Object.entries(me.stats).map(([label, value]) => (
          <View key={label} style={{ width: '50%', padding: 6 }}>
            <View style={{ backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: C.line, padding: 14 }}>
              <Text style={{ fontSize: 30, fontWeight: '800', color: C.violet }}>{String(value)}</Text>
              <Text style={{ color: C.muted, fontWeight: '600', fontSize: 13 }}>{label}</Text>
            </View>
          </View>
        ))}
      </View>
      <Card title={'What your role (' + me.user.role + ') can do'}>
        {(ABILITY_TEXT[me.user.role] || []).map((t) => <Body key={t} style={{ marginBottom: 4 }}>{'\u2022 ' + t}</Body>)}
      </Card>
    </View>
  );
}

// ------------------------------------------------------------------ records
export function Records({ refresh }) {
  const [list, setList] = useState(null);
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await api('/api/records');
    if (r.ok) setList(r.data.records);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function save() {
    setBusy(true); setMsg(null);
    const r = await api('/api/records', 'POST', { title, details });
    setBusy(false);
    if (r.ok) { setTitle(''); setDetails(''); setMsg({ kind: 'ok', text: 'Record saved (encrypted).' }); load(); refresh(); }
    else setMsg({ kind: 'error', text: r.data.error || 'Could not save.' });
  }

  function remove(rec) {
    confirmAction('Delete this record?', rec.title, async () => {
      const d = await api('/api/records', 'POST', { action: 'delete', id: rec.id });
      setMsg(d.ok ? { kind: 'ok', text: 'Record deleted.' } : { kind: 'error', text: d.data.error || 'Could not delete.' });
      load(); refresh();
    }, 'Delete');
  }

  return (
    <View>
      <Card title="New record">
        <Muted>Details are encrypted with AES-256-GCM before they reach the database.</Muted>
        <Msg kind={msg && msg.kind} text={msg && msg.text} />
        <Field label="Title" value={title} onChangeText={setTitle} maxLength={150} testID="rec-title" />
        <Field label="Details (stored encrypted)" value={details} onChangeText={setDetails} multiline maxLength={5000} testID="rec-details" />
        <Button title="Save record" onPress={save} busy={busy} disabled={!title.trim() || !details.trim()} testID="rec-save" />
      </Card>
      <Card title="Records you may see">
        {list === null ? <Muted>Loading...</Muted> : list.length === 0 ? <Muted>No records yet.</Muted> : list.map((rec) => (
          <View key={rec.id} style={{ borderWidth: 1, borderColor: C.line, borderRadius: 14, padding: 12, marginBottom: 10 }}>
            <Text style={{ fontWeight: '700', color: C.ink, fontSize: 15 }}>{rec.title}</Text>
            <Muted>{rec.fullName + ' - ' + fmt(rec.createdAt)}</Muted>
            <Body style={{ marginTop: 6 }}>{rec.details}</Body>
            {rec.canDelete ? <View style={{ flexDirection: 'row', marginTop: 8 }}><Button small kind="danger" title="Delete" onPress={() => remove(rec)} /></View> : null}
          </View>
        ))}
        <Button kind="ghost" title="Refresh" onPress={load} />
      </Card>
    </View>
  );
}

// ------------------------------------------------------------------ users
export function Users({ me, refresh }) {
  const a = me.abilities;
  const [msg, setMsg] = useState(null);
  const [users, setUsers] = useState(null);
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState(a.creatableRoles[0] || '');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!a.canDeleteInputters) return;
    const r = await api('/api/users');
    if (r.ok) setUsers(r.data.users);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function add() {
    setBusy(true); setMsg(null);
    const r = await api('/api/users', 'POST', { action: 'add', full_name: fullName, username, email, role, password });
    setBusy(false);
    if (r.ok) { setMsg({ kind: 'ok', text: r.data.message }); setFullName(''); setUsername(''); setEmail(''); setPassword(''); load(); refresh(); }
    else setMsg({ kind: 'error', text: r.data.error || 'Could not create the account.' });
  }

  async function act(action, u, question) {
    const run = async () => {
      const r = await api('/api/users', 'POST', { action, id: u.id });
      setMsg(r.ok ? { kind: 'ok', text: r.data.message } : { kind: 'error', text: r.data.error || 'Failed.' });
      load(); refresh();
    };
    if (question) confirmAction(question, u.username, run, 'Yes'); else run();
  }

  return (
    <View>
      <Msg kind={msg && msg.kind} text={msg && msg.text} />
      {a.creatableRoles.length ? (
        <Card title="Add a user">
          <Field label="Full name" value={fullName} onChangeText={setFullName} maxLength={100} autoCapitalize="words" testID="u-full" />
          <Field label="Username (letters, numbers, underscore)" value={username} onChangeText={setUsername} maxLength={30} testID="u-name" />
          <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" testID="u-email" />
          <Text style={{ fontWeight: '600', fontSize: 13, color: C.ink, marginTop: 12, marginBottom: 8 }}>Role</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {a.creatableRoles.map((r) => <Chip key={r} label={r} active={role === r} onPress={() => setRole(r)} />)}
          </View>
          <PasswordField label="Temporary password" value={password} onChangeText={setPassword} testID="u-pass" />
          <Button title="Create account" onPress={add} busy={busy} disabled={!fullName || !username || !email || !password} testID="u-create" />
        </Card>
      ) : null}
      {a.canDeleteInputters ? (
        <Card title={me.user.role === 'administrator' ? 'All users' : 'Inputters'}>
          {users === null ? <Muted>Loading...</Muted> : users.map((u) => (
            <View key={u.id} style={{ borderWidth: 1, borderColor: C.line, borderRadius: 14, padding: 12, marginBottom: 10 }}>
              <Text style={{ fontWeight: '700', color: C.ink }}>{u.full_name}</Text>
              <Muted>{u.username + ' - ' + u.email}</Muted>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
                <RoleTag role={u.role} />
                <Muted style={{ marginLeft: 10 }}>{'2FA: ' + (u.totp_enabled ? 'On' : 'Not yet') + '  -  ' + (u.is_locked ? 'Locked' : 'Active')}</Muted>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 }}>
                {u.role === 'inputter' ? <Button small kind="danger" title="Delete" onPress={() => act('delete', u, 'Delete this inputter?')} /> : null}
                {a.canRecover && u.is_locked ? <Button small kind="ghost" title="Unlock" onPress={() => act('unlock', u)} /> : null}
                {a.canRecover ? <Button small kind="ghost" title="Reset 2FA" onPress={() => act('reset2fa', u, 'Reset 2FA for this user?')} /> : null}
              </View>
            </View>
          ))}
          <Button kind="ghost" title="Refresh" onPress={load} />
        </Card>
      ) : null}
    </View>
  );
}

// ------------------------------------------------------------------ audit log
export function Audit() {
  const [entries, setEntries] = useState(null);
  const [msg, setMsg] = useState(null);
  const load = useCallback(async () => {
    const r = await api('/api/audit');
    if (r.ok) setEntries(r.data.entries);
  }, []);
  useEffect(() => { load(); }, [load]);

  function clear() {
    confirmAction('Clear the whole audit log?', 'Clearing is itself recorded in the log.', async () => {
      const d = await api('/api/audit', 'POST', { action: 'clear' });
      setMsg(d.ok ? { kind: 'ok', text: d.data.message } : { kind: 'error', text: d.data.error || 'Failed.' });
      load();
    }, 'Clear log');
  }

  return (
    <View>
      <Muted style={{ marginBottom: 10 }}>Every sign-in, change and denied attempt.</Muted>
      <Msg kind={msg && msg.kind} text={msg && msg.text} />
      <View style={{ flexDirection: 'row' }}>
        <Button small kind="ghost" title="Refresh" onPress={load} />
        <Button small kind="danger" title="Clear log" onPress={clear} />
      </View>
      <View style={{ height: 8 }} />
      {entries === null ? <Muted>Loading...</Muted> : entries.length === 0 ? <Muted>The log is empty.</Muted> : entries.slice(0, 100).map((e) => (
        <View key={e.id} style={{ backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: C.line, padding: 10, marginBottom: 8 }}>
          <Text style={{ fontWeight: '700', color: C.ink }}>{e.action}</Text>
          <Muted>{fmt(e.created_at) + '  -  ' + (e.username || '-') + (e.ip_address ? '  -  ' + e.ip_address : '')}</Muted>
          {e.detail ? <Body style={{ marginTop: 2 }}>{e.detail}</Body> : null}
        </View>
      ))}
      {entries && entries.length > 100 ? <Muted>Showing the newest 100 entries.</Muted> : null}
    </View>
  );
}

// ------------------------------------------------------------------ backup, restore, reset
export function Backup({ me, refresh }) {
  const a = me.abilities;
  const [list, setList] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [restoring, setRestoring] = useState(null);
  const [restorePassword, setRestorePassword] = useState('');
  const [confirmWord, setConfirmWord] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [formMsg, setFormMsg] = useState(null);

  const load = useCallback(async () => {
    const r = await api('/api/backups');
    if (r.ok) setList(r.data.backups); else setMsg({ kind: 'error', text: r.data.error || 'Could not load the backups.' });
  }, []);
  useEffect(() => { load(); }, [load]);

  async function backupNow() {
    setBusy(true); setMsg(null);
    const r = await api('/api/backups', 'POST', { action: 'create' });
    setBusy(false);
    setMsg(r.ok ? { kind: 'ok', text: r.data.message } : { kind: 'error', text: r.data.error || 'Backup failed.' });
    if (r.ok) load();
  }

  async function restore() {
    setFormMsg(null);
    const r = await api('/api/backups', 'POST', { action: 'restore', id: restoring.id, password: restorePassword });
    if (!r.ok) return setFormMsg({ kind: 'error', text: r.data.error || 'Restore failed.' });
    setRestoring(null); setRestorePassword('');
    setMsg({ kind: 'ok', text: r.data.message });
    load(); refresh();
  }

  function reset() {
    setFormMsg(null);
    confirmAction('Delete ALL records now?', 'A safety backup is taken first. Accounts and settings are not changed.', async () => {
      const r = await api('/api/backups', 'POST', { action: 'reset', confirm: confirmWord, password: resetPassword });
      if (!r.ok) return setFormMsg({ kind: 'error', text: r.data.error || 'Reset failed.' });
      setConfirmWord(''); setResetPassword('');
      setMsg({ kind: 'ok', text: r.data.message });
      load(); refresh();
    }, 'Reset');
  }

  return (
    <View>
      <Msg kind={msg && msg.kind} text={msg && msg.text} />
      <Card title="Back up now">
        <Muted>Saves an encrypted copy (AES-256-GCM) of the users and records. The newest 20 backups are kept.</Muted>
        <Button title="Back up now" onPress={backupNow} busy={busy} testID="backup-now" />
      </Card>
      {restoring ? (
        <Card title={'Restore backup #' + restoring.id + '?'} danger>
          <Muted>The current records are replaced by the records in this backup ({restoring.records}). A safety backup is taken first. Accounts, passwords, 2FA and settings are not changed.</Muted>
          <Msg kind={formMsg && formMsg.kind} text={formMsg && formMsg.text} />
          <PasswordField label="Your password (to confirm)" value={restorePassword} onChangeText={setRestorePassword} testID="restore-pass" />
          <Button kind="danger" title={'Restore backup #' + restoring.id} onPress={restore} disabled={!restorePassword} testID="restore-go" />
          <Button kind="ghost" title="Cancel" onPress={() => { setRestoring(null); setRestorePassword(''); setFormMsg(null); }} />
        </Card>
      ) : null}
      <Card title="Saved backups">
        {list === null ? <Muted>Loading...</Muted> : list.length === 0 ? <Muted>No backups yet. Press "Back up now".</Muted> : list.map((b) => (
          <View key={b.id} style={{ borderWidth: 1, borderColor: C.line, borderRadius: 14, padding: 12, marginBottom: 10 }}>
            <Text style={{ fontWeight: '700', color: C.ink }}>{'#' + b.id + '  -  ' + b.kind}</Text>
            <Muted>{fmt(b.createdAt) + '  -  by ' + (b.by || '-')}</Muted>
            <Muted>{b.users + ' users, ' + b.records + ' records'}</Muted>
            {a.canRestoreOrReset ? <View style={{ flexDirection: 'row', marginTop: 8 }}><Button small kind="ghost" title="Restore" onPress={() => { setRestoring(b); setFormMsg(null); }} /></View> : null}
          </View>
        ))}
      </Card>
      {a.canRestoreOrReset ? (
        <Card title="Reset (Administrator only)" danger>
          <Muted>Empties all staff records so you can start again. Accounts, roles, passwords, two-factor devices and every setting stay exactly as they are. A safety backup is saved first, so Restore can bring the records back.</Muted>
          {!restoring ? <Msg kind={formMsg && formMsg.kind} text={formMsg && formMsg.text} /> : null}
          <Field label="Type RESET in capital letters" value={confirmWord} onChangeText={setConfirmWord} autoCapitalize="characters" testID="reset-word" />
          <PasswordField label="Your password" value={resetPassword} onChangeText={setResetPassword} testID="reset-pass" />
          <Button kind="danger" title="Reset records (keep settings)" onPress={reset} disabled={!confirmWord || !resetPassword} testID="reset-go" />
        </Card>
      ) : null}
    </View>
  );
}

// ------------------------------------------------------------------ salt and pepper
const Step = ({ label, value }) => (
  <View style={{ borderLeftWidth: 4, borderLeftColor: C.violet, backgroundColor: '#faf7ff', padding: 10, borderRadius: 8, marginBottom: 8 }}>
    <Text style={{ fontSize: 12, fontWeight: '700', color: C.violet, marginBottom: 2 }}>{label}</Text>
    <Text selectable style={{ fontFamily: 'monospace', fontSize: 12, color: C.ink }}>{value}</Text>
  </View>
);

export function Credentials() {
  const [users, setUsers] = useState(null);
  const [error, setError] = useState(null);
  const [name, setName] = useState('');
  const [pass, setPass] = useState('');
  const [proof, setProof] = useState(null);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    (async () => {
      const r = await api('/api/credentials');
      if (r.ok) setUsers(r.data.users); else setError(r.data.error || 'Not available.');
    })();
  }, []);

  async function check() {
    setMsg(null); setProof(null);
    const d = await api('/api/credentials', 'POST', { username: name, password: pass });
    if (!d.ok) return setMsg({ kind: 'error', text: d.data.error || 'Failed.' });
    setProof(d.data);
  }

  if (error) return <Msg kind="error" text={error} />;
  return (
    <View>
      <Muted style={{ marginBottom: 10 }}>The proof for every user: what is stored and how a login is checked.</Muted>
      <Card title="What the database holds for every user">
        {users === null ? <Muted>Loading...</Muted> : users.map((u) => (
          <View key={u.username} style={{ borderWidth: 1, borderColor: C.line, borderRadius: 14, padding: 12, marginBottom: 10 }}>
            <Text style={{ fontWeight: '700', color: C.ink, marginBottom: 6 }}>{u.username + '  (' + u.role + ')'}</Text>
            <Step label="Salt (random, per user)" value={u.salt} />
            <Step label="Pepper (same for all)" value={u.pepper || '(hidden)'} />
            <Step label="Salt + pepper" value={u.salt_pepper || '(hidden)'} />
            <Step label="Stored hash" value={u.password_hash} />
          </View>
        ))}
      </Card>
      <Card title="Watch a login being checked">
        <Msg kind={msg && msg.kind} text={msg && msg.text} />
        <Field label="Username" value={name} onChangeText={setName} testID="cred-user" />
        <PasswordField label="Password to test" value={pass} onChangeText={setPass} testID="cred-pass" />
        <Button title="Run the 4 steps" onPress={check} disabled={!name || !pass} testID="cred-run" />
        {proof ? (
          <View style={{ marginTop: 14 }}>
            <Step label="STEP 1 - SALT (from the database)" value={proof.steps.salt} />
            <Step label="STEP 2 - PEPPER (from the environment)" value={proof.steps.pepper} />
            <Step label="STEP 3 - SALT + PEPPER joined" value={proof.steps.saltPepper} />
            <Step label={'STEP 4 - HASH = PBKDF2-SHA256(password, salt+pepper, ' + proof.rounds + ' rounds)'} value={proof.steps.computed} />
            <Step label="Hash stored in the database" value={proof.steps.stored} />
            <Msg kind={proof.match ? 'ok' : 'error'} text={proof.match ? 'MATCH: the password is correct.' : 'NO MATCH: the password is wrong.'} />
          </View>
        ) : null}
      </Card>
    </View>
  );
}

// ------------------------------------------------------------------ change password
export function ChangePassword({ onLocked }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  async function change() {
    setBusy(true); setMsg(null);
    const r = await api('/api/password', 'POST', { current, new: next, confirm: again });
    setBusy(false);
    if (r.ok) { setCurrent(''); setNext(''); setAgain(''); setMsg({ kind: 'ok', text: r.data.message }); return; }
    setMsg({ kind: 'error', text: r.data.error || 'Could not change the password.' });
    if (r.status === 429) onLocked(r.data.error);
  }

  return (
    <Card title="Change password">
      <Muted>A new salt is generated every time you change it.</Muted>
      <Msg kind={msg && msg.kind} text={msg && msg.text} />
      <PasswordField label="Current password" value={current} onChangeText={setCurrent} testID="pw-current" />
      <PasswordField label="New password" value={next} onChangeText={setNext} testID="pw-new" />
      <PasswordField label="Repeat new password" value={again} onChangeText={setAgain} testID="pw-again" />
      <Button title="Change password" onPress={change} busy={busy} disabled={!current || !next || !again} testID="pw-go" />
      <Muted style={{ marginTop: 12 }}>Rule: 10+ characters with an uppercase letter, a lowercase letter, a number and a symbol.</Muted>
    </Card>
  );
}
'@
