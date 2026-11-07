'use strict';
// Novo Care web server for local use and Render. On Vercel the same api/ files run as
// serverless functions and public/ is served as static files (see vercel.json).
//   /api/<name>   runs api/<name>.js
//   /healthz      tells Render the server is alive
//   anything else serves the files in public/
// No framework: Node's own http module only, so there is less code to trust.

const http = require('http');
const fs = require('fs');
const path = require('path');

const PUBLIC_DIR = path.join(__dirname, 'public');

const { SECURITY_HEADERS } = require('./lib/headers');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
  '.json': 'application/json',
};

// Only files that really exist inside public/ can be served (read once at start),
// so a request like /../../secret can never reach anything else.
function indexPublicFiles(dir, base = '') {
  const out = new Map();
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = base + '/' + entry.name;
    if (entry.isDirectory()) {
      for (const [k, v] of indexPublicFiles(path.join(dir, entry.name), rel)) out.set(k, v);
    } else {
      out.set(rel, path.join(dir, entry.name));
    }
  }
  return out;
}

// API routes: loaded from the api/ folder at start. Only these names exist.
function loadApi() {
  const routes = new Map();
  const dir = path.join(__dirname, 'api');
  for (const file of fs.readdirSync(dir)) {
    if (file.endsWith('.js')) routes.set(file.slice(0, -3), require(path.join(dir, file)));
  }
  return routes;
}

function createServer() {
  const files = indexPublicFiles(PUBLIC_DIR);
  const api = loadApi();

  return http.createServer((req, res) => {
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);

    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url, 'http://local').pathname); }
    catch (e) { res.statusCode = 400; return res.end('Bad request'); }

    if (pathname === '/healthz') {
      res.setHeader('Cache-Control', 'no-store');
      res.end('ok');
      return;
    }

    if (pathname.startsWith('/api/')) {
      const handler = api.get(pathname.slice(5));
      if (!handler) {
        res.statusCode = 404;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        return res.end('{"error":"Not found."}');
      }
      return handler(req, res);
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.statusCode = 405;
      res.setHeader('Allow', 'GET, HEAD');
      return res.end('Method not allowed');
    }

    const wanted = pathname === '/' ? '/index.html' : pathname === '/report' ? '/report.html' : pathname;
    const file = files.get(wanted);
    if (!file) { res.statusCode = 404; return res.end('Not found'); }

    res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
    // The page and the service worker are always re-checked, so updates show up quickly.
    res.setHeader('Cache-Control', wanted === '/index.html' || wanted === '/sw.js' ? 'no-cache' : 'public, max-age=300');
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT || 10000);
  createServer().listen(port, '0.0.0.0', () => console.log(require('./lib/labels').labels().appName + ' listening on port ' + port));
}

module.exports = { createServer };
