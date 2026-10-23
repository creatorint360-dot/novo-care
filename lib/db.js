'use strict';
// Database connection (PostgreSQL on AWS RDS).
// Every query in the project uses numbered placeholders ($1, $2 ...), so typed
// data is sent separately from the SQL command. This blocks SQL injection.

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

let pool = null;

// The connection is always encrypted (TLS). If the AWS certificate bundle is
// present (certs/rds-global-bundle.pem) the server's certificate is also
// CHECKED, so nobody can pretend to be the database. DB_SSL=off exists only
// for local testing.
function sslSettings() {
  if (process.env.DB_SSL === 'off') return false;
  const bundle = path.join(__dirname, '..', 'certs', 'rds-global-bundle.pem');
  if (fs.existsSync(bundle)) return { ca: fs.readFileSync(bundle, 'utf8'), rejectUnauthorized: true };
  if (process.env.DB_SSL === 'verify') throw new Error('DB_SSL=verify but certs/rds-global-bundle.pem is missing');
  return { rejectUnauthorized: false };   // encrypted, but the certificate is not checked
}

function getPool() {
  if (pool) return pool;
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
  // Remove ?sslmode=... from the link so our own ssl settings above are used.
  const connectionString = process.env.DATABASE_URL.replace(/([?&])sslmode=[^&]*&?/, '$1').replace(/[?&]$/, '');
  pool = new Pool({
    connectionString,
    ssl: sslSettings(),
    max: Number(process.env.DB_POOL_MAX || 5),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });
  // Without this handler, one dropped idle connection would crash the whole server.
  pool.on('error', (e) => console.error('database pool error:', e.message));
  return pool;
}

async function query(text, params = []) {
  return getPool().query(text, params);
}

async function end() {
  if (pool) { await pool.end(); pool = null; }
}

module.exports = { query, end };
