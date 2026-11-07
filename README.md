# Novo Care (a configurable secure login system)

Secure login: username + password (salt + pepper), 6-digit authenticator code (TOTP 2FA),
role-based access (Inputter, Manager, Admin, Administrator), encrypted records, audit log.
Installs on a phone like an app (PWA).

- `public/`   front end (HTML, CSS, JavaScript) and the installable-app files
- `api/`      back end routes
- `lib/`      security code. **Show the lecturer `lib/security.js`** (salt, pepper, concatenation, hash)
- `server.js` the web server for local use and Render (on Vercel, `api/` runs as serverless functions and `vercel.json` holds the settings)
- `schema.sql`, `least_privilege.sql`  database setup (AWS RDS PostgreSQL)
- `scripts/`  one-time helper scripts
- `lib/labels.js`  the words the system uses. Setting `SYSTEM_PROFILE` to `clinic` (default), `school`, `bank` or `staff`
  re-labels the website and the phone app (roles, what a record is called) with no other change.

Secrets are never in this repo. They are typed into Vercel > Project > Settings > Environment Variables (or Render > Environment)
(see `.env.example` for the names).
