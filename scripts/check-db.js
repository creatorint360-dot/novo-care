'use strict';
// Checks the database connection and reports what the connected account can do.
// Usage:  node scripts/check-db.js
const db = require('../lib/db');

(async () => {
  const who = await db.query('select current_user as me, current_database() as dbname, version() as v');
  const ssl = await db.query('select ssl, version as tls from pg_stat_ssl where pid = pg_backend_pid()');
  const tables = await db.query("select table_name from information_schema.tables where table_schema = 'public' order by 1");

  console.log('Connected as:', who.rows[0].me, '| database:', who.rows[0].dbname);
  console.log('Server:', who.rows[0].v.split(',')[0]);
  console.log('Encrypted (TLS):', ssl.rows[0].ssl, ssl.rows[0].tls || '');
  console.log('Tables:', tables.rows.map((r) => r.table_name).join(', ') || '(none)');

  try {
    await db.query('create table should_fail (x int)');
    console.log('WARNING: this account CAN create tables');
    await db.query('drop table should_fail');
  } catch (e) {
    console.log('Cannot create tables (good, this is the limited account):', e.message);
  }
  await db.end();
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
