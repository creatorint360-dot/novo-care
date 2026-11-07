'use strict';
// Shared wrapper for every API route. It applies the security checks in one place:
//   1. allowed HTTP methods only
//   2. CSRF protection (custom header + same-origin check) on every change
//   3. the user must be signed in (when the route needs it)
//   4. the user's role must be allowed (when the route limits roles)
//   5. errors are logged privately; the visitor only sees a generic message

const session = require('./session');
const { audit } = require('./audit');
const { SECURITY_HEADERS } = require('./headers');

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return String(forwarded).split(',')[0].trim().slice(0, 45);
  return String((req.socket && req.socket.remoteAddress) || '').slice(0, 45);
}

// CSRF defence for a JSON API: a browser will not add this custom header to a
// request sent from another website, and the Origin must match our own host.
function csrfOk(req) {
  if (req.headers['x-requested-with'] !== 'novostaff') return false;
  const origin = req.headers.origin;
  if (origin) {
    try { if (new URL(origin).host !== req.headers.host) return false; } catch (e) { return false; }
  }
  return true;
}

async function readBody(req) {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch (e) { return {}; } }
    if (Buffer.isBuffer(req.body)) { try { return JSON.parse(req.body.toString('utf8')); } catch (e) { return {}; } }
    return typeof req.body === 'object' ? req.body : {};
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 100000) throw new Error('Request too large');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch (e) { return {}; }
}

// options: { methods, auth, roles }
function route(options, handler) {
  const { methods = ['GET'], auth = true, roles = null } = options;
  return async (req, res) => {
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
    try {
      if (!methods.includes(req.method)) {
        res.setHeader('Allow', methods.join(', '));
        return json(res, 405, { error: 'Method not allowed.' });
      }
      if (req.method !== 'GET' && !csrfOk(req)) {
        return json(res, 403, { error: 'Request blocked by the security check.' });
      }

      const ip = clientIp(req);
      const body = req.method === 'GET' ? {} : await readBody(req);
      let user = null;

      if (auth) {
        user = await session.currentUser(req, res);
        if (!user) return json(res, 401, { error: 'Please sign in.' });
        if (roles && !roles.includes(user.role)) {
          await audit('access_denied', req.url, user.id, user.username, ip);
          return json(res, 403, { error: 'You do not have permission to do that.' });
        }
      }
      return await handler({ req, res, body, user, ip });
    } catch (e) {
      console.error(e);
      return json(res, 500, { error: 'Something went wrong. Please try again.' });
    }
  };
}

// Used inside a handler when one route serves several roles.
async function forbid(res, user, ip, detail) {
  await audit('access_denied', detail, user.id, user.username, ip);
  return json(res, 403, { error: 'You do not have permission to do that.' });
}

module.exports = { route, json, forbid, clientIp };
