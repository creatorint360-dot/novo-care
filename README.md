# Novo Staff

Secure staff login: username + password (salt + pepper), 6-digit authenticator code (TOTP 2FA),
role-based access (Inputter, Manager, Admin, Administrator), encrypted records, audit log.
Installs on a phone like an app (PWA).

- `public/`   front end (HTML, CSS, JavaScript) and the installable-app files
- `api/`      back end routes
- `lib/`      security code. **Show the lecturer `lib/security.js`** (salt, pepper, concatenation, hash)
- `server.js` the web server (runs on Render)
- `schema.sql`, `least_privilege.sql`  database setup (AWS RDS PostgreSQL)
- `scripts/`  one-time helper scripts

Secrets are never in this repo. They are typed into Render > Environment
(see `.env.example` for the names).
