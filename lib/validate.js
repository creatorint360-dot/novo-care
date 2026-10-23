'use strict';
// Input checks used when accounts are created.

function validateNewUser({ username, full_name, email }) {
  const errors = [];
  if (!/^[A-Za-z0-9_]{3,30}$/.test(username)) errors.push('Username: 3-30 letters, numbers or underscores.');
  if (!full_name || full_name.length > 100) errors.push('Enter the full name (up to 100 characters).');
  if (!email || email.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('Enter a valid email address.');
  return errors;
}

module.exports = { validateNewUser };
