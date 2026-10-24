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

Save-File "src\ui.js" @'
// Small building blocks shared by every screen.
import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, Alert, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

export const C = {
  cream: '#fff8f1', coral: '#ff7a59', violet: '#7c5cfc', ink: '#2a2342', muted: '#6f6989',
  line: '#eee6f7', card: '#ffffff', danger: '#d6455d',
  okText: '#14664a', okBg: '#e3f7ee', badText: '#8d1f33', badBg: '#ffe9ed', infoText: '#4a35b8', infoBg: '#efeaff',
  warnText: '#6b5200', warnBg: '#fff3cd',
};
// The same coral-to-violet blend the website uses on its buttons and its sign-in panel.
export const BRAND = [C.coral, C.violet];

// The rounded "N" square: coloured on white screens, white on the coloured panel.
export function BrandMark({ size = 38, onColor }) {
  const inner = <Text style={{ color: onColor ? C.violet : '#fff', fontWeight: '800', fontSize: size * 0.47 }}>N</Text>;
  const box = { width: size, height: size, borderRadius: size * 0.3, alignItems: 'center', justifyContent: 'center' };
  if (onColor) return <View style={[box, { backgroundColor: '#fff' }]}>{inner}</View>;
  return <LinearGradient colors={BRAND} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={box}>{inner}</LinearGradient>;
}

// The coloured welcome panel at the top of the sign-in screens (like the website's left side).
export function Hero() {
  const pills = ['Passwords protected with salt + pepper', 'Two-factor sign-in with an authenticator app', 'Records encrypted with AES-256-GCM'];
  return (
    <LinearGradient colors={BRAND} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 22, padding: 20, marginBottom: 22 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 18 }}>
        <BrandMark onColor />
        <Text style={{ marginLeft: 10, fontSize: 19, fontWeight: '800', color: '#fff' }}>Novo Staff</Text>
      </View>
      <Text style={{ fontSize: 24, fontWeight: '800', color: '#fff', lineHeight: 30 }}>Records you can trust, access you control.</Text>
      <Text style={{ color: 'rgba(255,255,255,0.92)', marginTop: 8, marginBottom: 14, lineHeight: 20 }}>A secure staff records portal with two-factor sign-in and role-based access.</Text>
      {pills.map((t) => (
        <View key={t} style={{ backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: 12, paddingVertical: 9, paddingHorizontal: 12, marginBottom: 8 }}>
          <Text style={{ color: '#fff', fontSize: 13 }}>{t}</Text>
        </View>
      ))}
    </LinearGradient>
  );
}

export function Card({ title, children, danger }) {
  return (
    <View style={{ backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: danger ? '#f3c3cb' : C.line, padding: 16, marginBottom: 14,
      shadowColor: C.violet, shadowOpacity: 0.07, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 1 }}>
      {title ? <Text style={{ fontSize: 17, fontWeight: '700', color: C.ink, marginBottom: 8 }}>{title}</Text> : null}
      {children}
    </View>
  );
}

export function Body({ children, style }) {
  return <Text style={[{ color: C.ink, fontSize: 14, lineHeight: 20 }, style]}>{children}</Text>;
}

export function Muted({ children, style, ...rest }) {
  return <Text {...rest} style={[{ color: C.muted, fontSize: 13, lineHeight: 18 }, style]}>{children}</Text>;
}

export function Msg({ kind, text }) {
  if (!text) return null;
  const look = kind === 'ok' ? [C.okBg, C.okText] : kind === 'error' ? [C.badBg, C.badText] : kind === 'warn' ? [C.warnBg, C.warnText] : [C.infoBg, C.infoText];
  return (
    <View style={{ backgroundColor: look[0], borderRadius: 12, padding: 12, marginBottom: 12 }}>
      <Text style={{ color: look[1], fontSize: 14 }}>{text}</Text>
    </View>
  );
}

export function Button({ title, onPress, kind = 'primary', disabled, busy, small, testID }) {
  const fg = kind === 'ghost' ? C.ink : '#ffffff';
  const content = busy ? <ActivityIndicator color={fg} /> : <Text style={{ color: fg, fontWeight: '700', fontSize: small ? 13 : 15 }}>{title}</Text>;
  const inner = { paddingVertical: small ? 8 : 13, paddingHorizontal: small ? 12 : 18, alignItems: 'center', justifyContent: 'center', borderRadius: 12 };
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => ({
        opacity: disabled || busy ? 0.6 : pressed ? 0.85 : 1,
        borderRadius: 12, overflow: 'hidden',
        marginTop: small ? 0 : 10, marginRight: small ? 8 : 0, marginBottom: small ? 6 : 0,
      })}
    >
      {kind === 'primary' ? (
        <LinearGradient colors={BRAND} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={inner}>{content}</LinearGradient>
      ) : (
        <View style={[inner, { backgroundColor: kind === 'danger' ? C.danger : '#ffffff', borderWidth: kind === 'ghost' ? 1.5 : 0, borderColor: C.line }]}>{content}</View>
      )}
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
import { Body, BrandMark, Button, C, Card, Field, Hero, Msg, Muted, PasswordField, RoleTag } from './src/ui';
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
            <Hero />
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
        <BrandMark size={34} />
        <View style={{ flex: 1, marginLeft: 10, marginRight: 8 }}>
          <Text style={{ fontSize: 19, fontWeight: '800', color: C.ink }} numberOfLines={1}>{titles[screen]}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
            <Muted numberOfLines={1} style={{ flexShrink: 1, marginRight: 6 }}>{me.user.fullName}</Muted>
            <RoleTag role={me.user.role} />
          </View>
        </View>
        <Button small kind="ghost" title="Menu" onPress={() => setMenuOpen(true)} testID="menu-open" />
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
          {me.demoMode ? <Msg kind="warn" text="Demo mode is ON: salt, pepper and their combination are visible in the database for the lecturer. Turn DEMO_MODE off after the demonstration." /> : null}
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

Save-File "scripts\prepare-build.js" @'
'use strict';
// Gets the app ready to be built as a real, installable Android app:
//   1. draws the Novo Staff icons (PNG) into assets/ with plain code
//   2. puts the app name and package id into app.json
//   3. adds an "preview" build that produces an .apk file in eas.json
// Run once from the project folder:  node scripts/prepare-build.js
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
const C1 = [255, 122, 89];    // coral
const C2 = [124, 92, 252];    // violet

// Letter N as three shapes in a 0..1 square (centre 0.5, 0.5).
function letterN(k) {
  const t = 0.105;
  const L = 0.5 - 0.20 * k, R = 0.5 + 0.20 * k, T = 0.5 - 0.23 * k, B = 0.5 + 0.23 * k, w = t * k;
  return [
    [[L, T], [L + w, T], [L + w, B], [L, B]],
    [[R - w, T], [R, T], [R, B], [R - w, B]],
    [[L, T], [L + w * 1.25, T], [R, B], [R - w * 1.25, B]],
  ];
}
function inPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function inRoundedSquare(x, y, r) {
  if (r <= 0) return true;
  const cx = Math.min(Math.max(x, r), 1 - r), cy = Math.min(Math.max(y, r), 1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

// mode: 'full'  coloured square with a white N
//       'back'  the coloured square only (adaptive icon background)
//       'front' a white N on a see-through background (adaptive icon foreground)
//       'mono'  a black N on a see-through background (Android themed icon)
function render(size, radius, letterScale, mode) {
  const shapes = letterN(letterScale);
  const SS = 3;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let py = 0; py < size; py++) {
    raw[py * (size * 4 + 1)] = 0;
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
        const x = (px + (sx + 0.5) / SS) / size, y = (py + (sy + 0.5) / SS) / size;
        if (mode !== 'front' && mode !== 'mono' && !inRoundedSquare(x, y, radius)) continue;
        const onLetter = shapes.some((s) => inPoly(x, y, s));
        let c;
        if (mode === 'back') c = C1.map((v, i) => v + (C2[i] - v) * ((x + y) / 2));
        else if (mode === 'front') { if (!onLetter) continue; c = [255, 255, 255]; }
        else if (mode === 'mono') { if (!onLetter) continue; c = [0, 0, 0]; }
        else c = onLetter ? [255, 255, 255] : C1.map((v, i) => v + (C2[i] - v) * ((x + y) / 2));
        r += c[0]; g += c[1]; b += c[2]; a += 255;
      }
      const n = SS * SS, o = py * (size * 4 + 1) + 1 + px * 4, cov = a / 255;
      raw[o] = cov ? Math.round(r / cov) : 0;
      raw[o + 1] = cov ? Math.round(g / cov) : 0;
      raw[o + 2] = cov ? Math.round(b / cov) : 0;
      raw[o + 3] = Math.round(a / n);
    }
  }
  return encodePng(size, raw);
}

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePng(size, raw) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---- 1. icons ----
const assets = path.join(ROOT, 'assets');
fs.mkdirSync(assets, { recursive: true });
const icons = [
  ['icon.png', 1024, 0, 0.8, 'full'],                       // the app icon (the phone rounds the corners)
  ['android-icon-background.png', 512, 0, 1, 'back'],
  ['android-icon-foreground.png', 512, 0, 0.62, 'front'],   // the N stays inside the safe middle
  ['android-icon-monochrome.png', 432, 0, 0.62, 'mono'],
  ['splash-icon.png', 1024, 0.25, 1, 'full'],
  ['favicon.png', 48, 0.25, 1, 'full'],
];
for (const [name, size, radius, scale, mode] of icons) {
  fs.writeFileSync(path.join(assets, name), render(size, radius, scale, mode));
  console.log('made assets/' + name);
}

// ---- 2. app.json ----
const appPath = path.join(ROOT, 'app.json');
const app = JSON.parse(fs.readFileSync(appPath, 'utf8'));
app.expo = app.expo || {};
app.expo.name = 'Novo Staff';
app.expo.android = app.expo.android || {};
app.expo.android.package = 'com.novostaff.app';
app.expo.ios = app.expo.ios || {};
app.expo.ios.bundleIdentifier = 'com.novostaff.app';
fs.writeFileSync(appPath, JSON.stringify(app, null, 2) + '\n');
console.log('updated app.json (name Novo Staff, package com.novostaff.app)');

// ---- 3. eas.json: a "preview" build that makes an installable .apk ----
const easPath = path.join(ROOT, 'eas.json');
const eas = fs.existsSync(easPath) ? JSON.parse(fs.readFileSync(easPath, 'utf8')) : {};
eas.build = eas.build || {};
eas.build.preview = Object.assign({}, eas.build.preview, { distribution: 'internal', android: { buildType: 'apk' } });
fs.writeFileSync(easPath, JSON.stringify(eas, null, 2) + '\n');
console.log('updated eas.json (preview build = .apk file)');
'@
