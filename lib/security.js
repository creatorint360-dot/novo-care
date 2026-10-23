'use strict';
// =====================================================================
//  PASSWORD SECURITY: SALT + PEPPER, WRITTEN OUT STEP BY STEP
// =====================================================================
//  Every credential is built in 4 visible steps:
//
//    STEP 1  SALT         random value, different for every user
//                         -> stored in the database (column: salt)
//    STEP 2  PEPPER       secret value, the same for every user
//                         -> kept in the PEPPER environment variable (not in the database)
//    STEP 3  CONCATENATE  salt_pepper = salt + pepper
//                         -> the two values joined into one text
//    STEP 4  HASH         PBKDF2-HMAC-SHA256(password, salt_pepper, 600000 rounds)
//                         -> stored in the database (column: password_hash)
//
//  The users table keeps: salt, pepper, salt_pepper, password_hash.
//  The pepper copy and the concatenation are stored ONLY for demonstration
//  (DEMO_MODE=true). Login always rebuilds them from the salt and the pepper
//  environment variable, never from the pepper column.
// =====================================================================

const crypto = require('crypto');
const { promisify } = require('util');
const pbkdf2 = promisify(crypto.pbkdf2);

const HASH_ALGORITHM = 'sha256';
const HASH_ROUNDS = 600000;   // deliberately slow, so guessing is very expensive
const HASH_BYTES = 32;        // 32 bytes = 64 hex characters

// ---------- STEP 1: SALT ----------
function generateSalt() {
  return crypto.randomBytes(16).toString('hex');   // 16 random bytes = 32 hex characters
}

// ---------- STEP 2: PEPPER ----------
function getPepper() {
  const pepper = process.env.PEPPER;               // comes from the environment, not the database
  if (!pepper || pepper.length < 32) throw new Error('PEPPER is missing or too short');
  return pepper;
}

// ---------- STEP 3: CONCATENATION ----------
function combineSaltAndPepper(salt, pepper) {
  return salt + pepper;                            // the plus (+) joins two texts in JavaScript
}

// ---------- STEP 4: HASH ----------
async function hashWithSaltPepper(password, saltPepper) {
  const key = await pbkdf2(password, saltPepper, HASH_ROUNDS, HASH_BYTES, HASH_ALGORITHM);
  return key.toString('hex');
}

function demoMode() {
  return process.env.DEMO_MODE === 'true';
}

// ---------- All four steps together ----------
async function makeCredentials(password) {
  const salt = generateSalt();                                   // step 1
  const pepper = getPepper();                                    // step 2
  const saltPepper = combineSaltAndPepper(salt, pepper);         // step 3
  const hash = await hashWithSaltPepper(password, saltPepper);   // step 4

  const demo = demoMode();
  return {
    salt,
    pepper: demo ? pepper : null,          // shown in the database in demo mode only
    salt_pepper: demo ? saltPepper : null,
    password_hash: hash,
  };
}

function safeEqualHex(a, b) {
  const x = Buffer.from(String(a), 'hex');
  const y = Buffer.from(String(b), 'hex');
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
}

// ---------- Checking a password at login ----------
// Rebuild salt + pepper (salt from the database, pepper from the environment),
// hash the typed password the same way, and compare with the stored hash.
async function verifyCredentials(user, password) {
  const saltPepper = combineSaltAndPepper(user.salt, getPepper());
  const hash = await hashWithSaltPepper(password, saltPepper);
  return safeEqualHex(hash, user.password_hash);
}

// Used for unknown usernames, so a missing user takes the same time as a real one.
async function dummyCredentialCheck(password) {
  await hashWithSaltPepper(password, '0'.repeat(32) + getPepper());
}

// ---------- Password policy ----------
// Returns a list of problems (an empty list means the password is fine).
function passwordPolicyErrors(password) {
  const errors = [];
  if (password.length < 10) errors.push('Use at least 10 characters.');
  if (!/[A-Z]/.test(password)) errors.push('Add an uppercase letter.');
  if (!/[a-z]/.test(password)) errors.push('Add a lowercase letter.');
  if (!/[0-9]/.test(password)) errors.push('Add a number.');
  if (!/[^A-Za-z0-9]/.test(password)) errors.push('Add a symbol.');
  return errors;
}

module.exports = {
  HASH_ROUNDS,
  generateSalt,
  getPepper,
  combineSaltAndPepper,
  hashWithSaltPepper,
  makeCredentials,
  verifyCredentials,
  dummyCredentialCheck,
  passwordPolicyErrors,
  demoMode,
};
