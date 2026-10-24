'use strict';
// TOTP (RFC 6238): time-based one-time passwords, built from scratch.
// The phone app and the server share a secret. Every 30 seconds both mix the
// secret with the current time and shorten the result to 6 digits.

const crypto = require('crypto');

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buf) {
  let bits = '';
  for (const byte of buf) bits += byte.toString(2).padStart(8, '0');
  let out = '';
  for (let i = 0; i < bits.length; i += 5) {
    out += ALPHABET[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)];
  }
  return out;
}

function base32Decode(text) {
  let bits = '';
  for (const ch of text.toUpperCase()) {
    const i = ALPHABET.indexOf(ch);
    if (i >= 0) bits += i.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

// 160-bit random secret, as recommended by the RFC.
function generateSecret() {
  return base32Encode(crypto.randomBytes(20));
}

// HMAC-SHA1 over the 30-second time counter, then "dynamic truncation" to 6 digits.
function codeFor(secret, timeStep) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(timeStep));
  const hmac = crypto.createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const offset = hmac[19] & 0x0f;
  const value = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(value % 1000000).padStart(6, '0');
}

function currentStep(now = Date.now()) {
  return Math.floor(now / 30000);
}

// Accepts the current code and one 30-second step either side (clock drift).
// A step that was already used is refused, so a code cannot be used twice.
// Returns the matching time step, or null.
function verify(secret, code, lastUsedStep = 0, now = Date.now()) {
  const clean = String(code).replace(/\s+/g, '');
  if (!/^\d{6}$/.test(clean)) return null;
  const base = currentStep(now);
  for (let i = -1; i <= 1; i++) {
    const step = base + i;
    if (step <= lastUsedStep) continue;
    if (crypto.timingSafeEqual(Buffer.from(codeFor(secret, step)), Buffer.from(clean))) return step;
  }
  return null;
}

function uri(secret, account, issuer = require('./labels').labels().appName) {
  return 'otpauth://totp/' + encodeURIComponent(issuer + ':' + account)
    + '?secret=' + secret + '&issuer=' + encodeURIComponent(issuer) + '&digits=6&period=30';
}

module.exports = { base32Encode, base32Decode, generateSecret, codeFor, currentStep, verify, uri };
