'use strict';
// Encryption at rest: AES-256-GCM (authenticated encryption).
// Used for record details and each user's 2FA secret.
// Output format: "enc:v1:" + base64( IV (12 bytes) + auth tag (16 bytes) + ciphertext )
// This is the same format as the PHP/XAMPP version.

const crypto = require('crypto');

function key() {
  const k = Buffer.from(process.env.ENC_KEY || '', 'base64');
  if (k.length !== 32) throw new Error('ENC_KEY must be 32 random bytes, base64 encoded');
  return k;
}

function encrypt(plain) {
  const iv = crypto.randomBytes(12);                       // fresh random IV every time
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const ct = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();                         // proves the data was not changed
  return 'enc:v1:' + Buffer.concat([iv, tag, ct]).toString('base64');
}

function decrypt(stored) {
  if (stored === null || stored === undefined) return '';
  if (!String(stored).startsWith('enc:v1:')) return String(stored);   // old unencrypted rows
  try {
    const raw = Buffer.from(String(stored).slice(7), 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key(), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
  } catch (e) {
    return '[unreadable: data was altered]';
  }
}

module.exports = { encrypt, decrypt };
