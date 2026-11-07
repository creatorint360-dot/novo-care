-- =====================================================================
--  A limited database account for the website (least privilege).
--  Run with:  node scripts/run-sql.js least_privilege.sql
--  (the password comes from the NOVO_APP_PASSWORD environment variable,
--   so it is never written in a file).
--  This account can ONLY read/write the 5 Novo Care tables. It cannot
--  create, drop or change tables, so a bug cannot damage the structure.
-- =====================================================================
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'novostaff_app') then
    create role novostaff_app login password '__APP_PASSWORD__';
  else
    alter role novostaff_app login password '__APP_PASSWORD__';
  end if;
end $$;

grant usage on schema public to novostaff_app;
grant select on roles to novostaff_app;
grant select, insert, update, delete on users, records, audit_log to novostaff_app;
grant select, insert, delete on backups to novostaff_app;   -- snapshots are never edited
grant usage, select on all sequences in schema public to novostaff_app;
