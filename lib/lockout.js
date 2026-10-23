'use strict';
// Account lockout: 5 wrong attempts lock the account for 15 minutes.
// Used for wrong passwords, wrong 2FA codes and wrong "current password"
// entries, so every way of guessing is limited.

const db = require('./db');
const { audit } = require('./audit');

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

// Returns true if this failure locked the account.
async function registerFailure(user, action, detail, ip) {
  const { rows } = await db.query(
    'update users set failed_attempts = failed_attempts + 1 where id = $1 returning failed_attempts',
    [user.id]
  );
  if (rows[0] && Number(rows[0].failed_attempts) >= MAX_ATTEMPTS) {
    await db.query(
      'update users set failed_attempts = 0, locked_until = now() + make_interval(mins => $1::int) where id = $2',
      [LOCK_MINUTES, user.id]
    );
    await audit('account_locked', detail, user.id, user.username, ip);
    return true;
  }
  await audit(action, detail, user.id, user.username, ip);
  return false;
}

module.exports = { registerFailure, MAX_ATTEMPTS, LOCK_MINUTES };
