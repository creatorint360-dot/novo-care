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

Save-File "src\config.js" @'
// The address of the online Novo Staff system. The app and the website share the
// same server, the same database and the same accounts.
// Change this ONE line if the website address ever changes.
export const API_BASE = process.env.EXPO_PUBLIC_API_BASE || 'https://novo-staff.onrender.com';
'@

Save-File "src\api.js" @'
// Talks to the Novo Staff server. The app does not use cookies: the server hands out the
// same signed values in two headers (X-Pending-Token, X-Session-Token) when it sees
// "X-Client: novostaff-app". They are kept in the phone's secure storage
// (Android Keystore / iOS Keychain) and nowhere else.
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { API_BASE } from './config';

const SESSION = 'ns_session';
const PENDING = 'ns_pending';
const memory = {};

async function saveToken(name, value) {
  memory[name] = value || '';
  if (Platform.OS === 'web') return;
  try {
    if (value) await SecureStore.setItemAsync(name, value);
    else await SecureStore.deleteItemAsync(name);
  } catch (e) { /* the copy in memory still works for this run */ }
}

async function loadToken(name) {
  if (memory[name] !== undefined) return memory[name];
  if (Platform.OS === 'web') return '';
  try { memory[name] = (await SecureStore.getItemAsync(name)) || ''; } catch (e) { memory[name] = ''; }
  return memory[name];
}

export async function hasSavedSession() {
  return Boolean(await loadToken(SESSION));
}

// Forget everything on this phone (used when signing out or when the session ended).
export async function forgetTokens() {
  await saveToken(SESSION, '');
  await saveToken(PENDING, '');
}

let onSessionEnded = () => {};
export function setSessionEndedHandler(fn) { onSessionEnded = fn; }

const WAIT_MS = 90000;   // the free server can take about a minute to wake up

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then((v) => { clearTimeout(timer); resolve(v); }, (e) => { clearTimeout(timer); reject(e); });
  });
}

// Returns { ok, status, data }. It never throws.
export async function api(path, method = 'GET', body) {
  const headers = { 'X-Requested-With': 'novostaff', 'X-Client': 'novostaff-app' };
  const session = await loadToken(SESSION);
  const pending = await loadToken(PENDING);
  if (session) headers['X-Session-Token'] = session;
  if (pending) headers['X-Pending-Token'] = pending;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let res;
  try {
    res = await withTimeout(fetch(API_BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), WAIT_MS);
  } catch (e) {
    return { ok: false, status: 0, data: { error: 'Cannot reach the server. Check your internet and try again. (The free server can take up to a minute to wake up.)' } };
  }

  const s = res.headers.get('x-session-token');
  if (s !== null) await saveToken(SESSION, s);
  const p = res.headers.get('x-pending-token');
  if (p !== null) await saveToken(PENDING, p);

  let data = {};
  try { data = await res.json(); } catch (e) { /* not JSON */ }

  // The server says "please sign in" on a protected page: the session is over.
  if (res.status === 401 && data && data.error === 'Please sign in.') {
    await forgetTokens();
    onSessionEnded();
  }
  return { ok: res.ok, status: res.status, data };
}
'@

Save-File "src\ui.js" @'
// Small building blocks shared by every screen.
import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, Alert, Platform } from 'react-native';

export const C = {
  cream: '#fff8f1', coral: '#ff7a59', violet: '#7c5cfc', ink: '#2a2342', muted: '#6f6989',
  line: '#eee6f7', card: '#ffffff', danger: '#d6455d',
  okText: '#14664a', okBg: '#e3f7ee', badText: '#8d1f33', badBg: '#ffe9ed', infoText: '#4a35b8', infoBg: '#efeaff',
};

export function Card({ title, children, danger }) {
  return (
    <View style={{ backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: danger ? '#f3c3cb' : C.line, padding: 16, marginBottom: 14 }}>
      {title ? <Text style={{ fontSize: 17, fontWeight: '700', color: C.ink, marginBottom: 8 }}>{title}</Text> : null}
      {children}
    </View>
  );
}

export function Body({ children, style }) {
  return <Text style={[{ color: C.ink, fontSize: 14, lineHeight: 20 }, style]}>{children}</Text>;
}

export function Muted({ children, style }) {
  return <Text style={[{ color: C.muted, fontSize: 13, lineHeight: 18 }, style]}>{children}</Text>;
}

export function Msg({ kind, text }) {
  if (!text) return null;
  const look = kind === 'ok' ? [C.okBg, C.okText] : kind === 'error' ? [C.badBg, C.badText] : [C.infoBg, C.infoText];
  return (
    <View style={{ backgroundColor: look[0], borderRadius: 12, padding: 12, marginBottom: 12 }}>
      <Text style={{ color: look[1], fontSize: 14 }}>{text}</Text>
    </View>
  );
}

export function Button({ title, onPress, kind = 'primary', disabled, busy, small, testID }) {
  const bg = kind === 'primary' ? C.violet : kind === 'danger' ? C.danger : '#ffffff';
  const fg = kind === 'ghost' ? C.ink : '#ffffff';
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => ({
        backgroundColor: bg, opacity: disabled || busy ? 0.6 : pressed ? 0.85 : 1,
        borderRadius: 12, paddingVertical: small ? 8 : 13, paddingHorizontal: small ? 12 : 18,
        alignItems: 'center', justifyContent: 'center', borderWidth: kind === 'ghost' ? 1.5 : 0, borderColor: C.line,
        marginTop: small ? 0 : 10, marginRight: small ? 8 : 0, marginBottom: small ? 6 : 0,
      })}
    >
      {busy ? <ActivityIndicator color={fg} /> : <Text style={{ color: fg, fontWeight: '700', fontSize: small ? 13 : 15 }}>{title}</Text>}
    </Pressable>
  );
}

export function Field({ label, style, ...props }) {
  return (
    <View style={{ marginTop: 12 }}>
      <Text style={{ fontWeight: '600', fontSize: 13, color: C.ink, marginBottom: 6 }}>{label}</Text>
      <TextInput
        placeholderTextColor="#a9a3c0"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
        importantForAutofill="no"
        {...props}
        style={[{ borderWidth: 1.5, borderColor: C.line, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, color: C.ink, backgroundColor: '#fff' }, props.multiline ? { minHeight: 100, textAlignVertical: 'top' } : null, style]}
      />
    </View>
  );
}

// A password box with a Show / Hide button.
export function PasswordField({ label, ...props }) {
  const [shown, setShown] = useState(false);
  return (
    <View style={{ marginTop: 12 }}>
      <Text style={{ fontWeight: '600', fontSize: 13, color: C.ink, marginBottom: 6 }}>{label}</Text>
      <View style={{ justifyContent: 'center' }}>
        <TextInput
          placeholderTextColor="#a9a3c0"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          importantForAutofill="no"
          {...props}
          secureTextEntry={!shown}
          style={{ borderWidth: 1.5, borderColor: C.line, borderRadius: 12, paddingLeft: 14, paddingRight: 70, paddingVertical: 11, fontSize: 15, color: C.ink, backgroundColor: '#fff' }}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={shown ? 'Hide password' : 'Show password'}
          onPress={() => setShown(!shown)}
          style={{ position: 'absolute', right: 8, paddingVertical: 6, paddingHorizontal: 10 }}
        >
          <Text style={{ color: C.violet, fontWeight: '700', fontSize: 13 }}>{shown ? 'Hide' : 'Show'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function Chip({ label, active, onPress }) {
  return (
    <Pressable onPress={onPress} style={{ paddingVertical: 7, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1.5, borderColor: active ? C.violet : C.line, backgroundColor: active ? C.infoBg : '#fff', marginRight: 8, marginBottom: 8 }}>
      <Text style={{ color: active ? C.infoText : C.muted, fontWeight: '700', textTransform: 'capitalize' }}>{label}</Text>
    </Pressable>
  );
}

export function RoleTag({ role }) {
  return (
    <View style={{ alignSelf: 'flex-start', backgroundColor: C.infoBg, borderRadius: 999, paddingVertical: 2, paddingHorizontal: 10 }}>
      <Text style={{ color: C.infoText, fontWeight: '700', fontSize: 12, textTransform: 'capitalize' }}>{role}</Text>
    </View>
  );
}

// Ask "are you sure?" before a risky action (works on the phone and in a browser test).
export function confirmAction(title, message, onYes, yesText = 'Yes') {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.confirm(title + '\n\n' + message)) onYes();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: yesText, style: 'destructive', onPress: onYes },
  ]);
}

export const fmt = (d) => new Date(d).toLocaleString();
'@

Save-File "App.js" @'
// Novo Staff mobile app (Expo / React Native).
// Same accounts, same database and same rules as the website: it talks to the online server.
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, AppState, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, forgetTokens, hasSavedSession, setSessionEndedHandler } from './src/api';
import { Body, Button, C, Card, Field, Msg, Muted, PasswordField } from './src/ui';
import { Audit, Backup, ChangePassword, Credentials, Dashboard, Records, Users } from './src/screens';

// ------------------------------------------------------------------ step 1: username + password
function Login({ note, onNext }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState(note ? { kind: 'info', text: note } : null);
  const [busy, setBusy] = useState(false);

  async function go() {
    setBusy(true); setMsg(null);
    const r = await api('/api/login', 'POST', { username: username.trim(), password });
    setBusy(false);
    if (r.ok) { setPassword(''); return onNext(); }
    setMsg({ kind: 'error', text: r.data.error || 'Sign-in failed.' });
  }

  return (
    <View>
      <Text style={{ fontSize: 26, fontWeight: '800', color: C.ink }}>Welcome back</Text>
      <Muted style={{ marginBottom: 14 }}>Step 1 of 2: your username and password.</Muted>
      <Msg kind={msg && msg.kind} text={msg && msg.text} />
      <Field label="Username" value={username} onChangeText={setUsername} maxLength={50} testID="login-user" />
      <PasswordField label="Password" value={password} onChangeText={setPassword} testID="login-pass" />
      <Button title="Continue" onPress={go} busy={busy} disabled={!username.trim() || !password} testID="login-go" />
    </View>
  );
}

// ------------------------------------------------------------------ step 2: the 6-digit code
function TwoFactor({ onDone, onBack }) {
  const [info, setInfo] = useState(null);
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const r = await api('/api/twofactor');
      if (!r.ok) return onBack(r.data.error || 'Please sign in again.');
      setInfo(r.data);
    })();
  }, []);

  async function verify() {
    setBusy(true); setMsg(null);
    const r = await api('/api/twofactor', 'POST', { code: code.replace(/\s/g, '') });
    setBusy(false);
    if (r.ok) return onDone();
    if (r.data.restart) return onBack(r.data.error);
    setMsg({ kind: 'error', text: r.data.error || 'Verification failed.' });
  }

  async function openAuthenticator() {
    try { await Linking.openURL(info.uri); }
    catch (e) { setMsg({ kind: 'error', text: 'No authenticator app could open the link. Type the key into your app instead.' }); }
  }

  if (!info) return <ActivityIndicator color={C.violet} style={{ marginTop: 40 }} />;
  return (
    <View>
      <Text style={{ fontSize: 26, fontWeight: '800', color: C.ink }}>Check your phone</Text>
      <Muted style={{ marginBottom: 14 }}>{'Step 2 of 2: ' + info.username + ', enter the code from your authenticator app.'}</Muted>
      {info.enrolling ? (
        <Card title="First sign-in: link your authenticator app">
          <Body>1. Open Google Authenticator, Microsoft Authenticator or Authy.</Body>
          <Body>2. Choose "Add" and then "Enter a setup key".</Body>
          <Body style={{ marginBottom: 8 }}>3. Type this key (press and hold it to copy):</Body>
          <View style={{ backgroundColor: '#faf7ff', borderRadius: 10, padding: 10 }}>
            <Text selectable testID="setup-key" style={{ fontFamily: 'monospace', fontSize: 15, color: C.ink, textAlign: 'center' }}>{info.secret}</Text>
          </View>
          <Button kind="ghost" title="Open my authenticator app for me" onPress={openAuthenticator} />
        </Card>
      ) : null}
      <Msg kind={msg && msg.kind} text={msg && msg.text} />
      <Field label="6-digit code" value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={7} testID="code-input"
        style={{ textAlign: 'center', fontSize: 24, letterSpacing: 6 }} />
      <Button title={info.enrolling ? 'Link device and sign in' : 'Verify and sign in'} onPress={verify} busy={busy} disabled={code.replace(/\s/g, '').length < 6} testID="code-go" />
      <Button kind="ghost" title="Back to sign-in" onPress={() => onBack()} />
    </View>
  );
}

// ------------------------------------------------------------------ the signed-in app
function Main() {
  const insets = useSafeAreaInsets();
  const [phase, setPhase] = useState('loading');   // loading | login | twofa | app
  const [note, setNote] = useState('');
  const [me, setMe] = useState(null);
  const [screen, setScreen] = useState('dashboard');
  const [menuOpen, setMenuOpen] = useState(false);

  const backToLogin = useCallback(async (text) => {
    await forgetTokens();
    setMe(null); setScreen('dashboard'); setMenuOpen(false);
    setNote(text || ''); setPhase('login');
  }, []);

  const refresh = useCallback(async () => {
    const r = await api('/api/me');
    if (r.ok) setMe(r.data);
  }, []);

  const enterApp = useCallback(async () => {
    const r = await api('/api/me');
    if (!r.ok) return backToLogin('Please sign in again.');
    setMe(r.data); setScreen('dashboard'); setNote(''); setPhase('app');
  }, [backToLogin]);

  useEffect(() => {
    setSessionEndedHandler(() => { setMe(null); setMenuOpen(false); setNote('Your session ended. Please sign in again.'); setPhase('login'); });
    (async () => {
      if (await hasSavedSession()) return enterApp();
      setPhase('login');
    })();
  }, []);

  // Coming back to the app after a while: check the session is still alive.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => { if (state === 'active' && phase === 'app') refresh(); });
    return () => sub.remove();
  }, [phase, refresh]);

  async function signOut() {
    await api('/api/logout', 'POST', {});
    await backToLogin('You are signed out.');
  }

  const shellStyle = { flex: 1, backgroundColor: C.cream, paddingTop: insets.top };

  if (phase === 'loading') {
    return <View style={[shellStyle, { alignItems: 'center', justifyContent: 'center' }]}><ActivityIndicator size="large" color={C.violet} /></View>;
  }

  if (phase !== 'app') {
    return (
      <View style={shellStyle}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 22, paddingBottom: 40 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 22 }}>
              <View style={{ width: 38, height: 38, borderRadius: 11, backgroundColor: C.violet, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 18 }}>N</Text>
              </View>
              <Text style={{ marginLeft: 10, fontSize: 20, fontWeight: '800', color: C.ink }}>Novo Staff</Text>
            </View>
            {phase === 'login' ? <Login key={note} note={note} onNext={() => setPhase('twofa')} /> : null}
            {phase === 'twofa' ? <TwoFactor onDone={enterApp} onBack={(t) => backToLogin(t)} /> : null}
            <Muted style={{ marginTop: 26, textAlign: 'center' }}>Computer Security - PBIT 309 / PBSE 309</Muted>
          </ScrollView>
        </KeyboardAvoidingView>
        <StatusBar style="dark" />
      </View>
    );
  }

  const a = me.abilities;
  const items = [['dashboard', 'Dashboard'], ['records', 'Records']];
  if (a.creatableRoles.length || a.canDeleteInputters) items.push(['users', 'Users']);
  if (a.canViewAudit) items.push(['audit', 'Audit log']);
  if (a.canBackup) items.push(['backup', 'Backup']);
  if (a.canViewAudit && me.demoMode) items.push(['credentials', 'Salt & pepper']);
  items.push(['password', 'Change password']);
  const titles = Object.fromEntries(items);
  titles.dashboard = 'Hello, ' + me.user.fullName.split(' ')[0];

  const common = { me, refresh };
  const body = {
    dashboard: <Dashboard {...common} />,
    records: <Records {...common} />,
    users: <Users {...common} />,
    audit: <Audit />,
    backup: <Backup {...common} />,
    credentials: <Credentials />,
    password: <ChangePassword onLocked={(t) => backToLogin(t)} />,
  }[screen];

  return (
    <View style={shellStyle}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.line, backgroundColor: '#fff' }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 20, fontWeight: '800', color: C.ink }} numberOfLines={1}>{titles[screen]}</Text>
          <Muted>{me.user.fullName + ' - ' + me.user.role}</Muted>
        </View>
        <Button small kind="ghost" title="Menu" onPress={() => setMenuOpen(true)} testID="menu-open" />
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
          {me.demoMode ? <Msg kind="info" text="Demo mode is ON: salt, pepper and their combination are visible in the database for the lecturer. Turn DEMO_MODE off after the demonstration." /> : null}
          <View key={screen}>{body}</View>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(42,35,66,0.45)' }} onPress={() => setMenuOpen(false)}>
          <View style={{ marginTop: insets.top + 8, marginHorizontal: 16, backgroundColor: '#fff', borderRadius: 18, padding: 10 }}>
            {items.map(([key, label]) => (
              <Pressable key={key} testID={'menu-' + key} onPress={() => { setScreen(key); setMenuOpen(false); }}
                style={{ paddingVertical: 14, paddingHorizontal: 14, borderRadius: 12, backgroundColor: key === screen ? C.infoBg : '#fff' }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: key === screen ? C.infoText : C.ink }}>{label}</Text>
              </Pressable>
            ))}
            <Pressable testID="menu-signout" onPress={signOut} style={{ paddingVertical: 14, paddingHorizontal: 14 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: C.danger }}>Sign out</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
      <StatusBar style="dark" />
    </View>
  );
}

export default function App() {
  return <SafeAreaProvider><Main /></SafeAreaProvider>;
}
'@
