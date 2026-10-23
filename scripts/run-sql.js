'use strict';
// Runs a .sql file against the database named in DATABASE_URL.
// Usage:  node scripts/run-sql.js schema.sql
// Used for the one-time database setup, from your own computer.
const fs = require('fs');
const path = require('path');
const db = require('../lib/db');

(async () => {
  const file = process.argv[2];
  if (!file) throw new Error('Usage: node scripts/run-sql.js <file.sql>');
  let sql = fs.readFileSync(path.resolve(file), 'utf8');

  if (sql.includes('__APP_PASSWORD__')) {
    const pw = process.env.NOVO_APP_PASSWORD || '';
    if (!/^[A-Za-z0-9]{16,64}$/.test(pw)) {
      throw new Error('Set NOVO_APP_PASSWORD first: 16 to 64 letters and numbers only.');
    }
    sql = sql.split('__APP_PASSWORD__').join(pw);
  }
  await db.query(sql);
  console.log('OK: ' + file + ' ran without errors.');
  await db.end();
})().catch((e) => { console.error('FAILED: ' + e.message); process.exit(1); });
