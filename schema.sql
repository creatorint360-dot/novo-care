-- =====================================================================
--  Novo Staff database (PostgreSQL on AWS RDS)
--  Run with:  node scripts/run-sql.js schema.sql
--  It is safe to run more than once.
-- =====================================================================

create table if not exists roles (
  id   smallint primary key,
  name text not null unique
);

insert into roles (id, name) values
  (1, 'inputter'), (2, 'manager'), (3, 'admin'), (4, 'administrator')
on conflict (id) do nothing;

create table if not exists users (
  id              serial primary key,
  username        varchar(50)  not null unique,        -- identification
  full_name       varchar(100) not null,
  email           varchar(120) not null unique,
  password_hash   varchar(255) not null,               -- STEP 4: the final hash (PBKDF2)
  salt            varchar(64)  not null,               -- STEP 1: random, different per user
  pepper          varchar(128),                        -- STEP 2: copy of the pepper (demo mode only)
  salt_pepper     varchar(255),                        -- STEP 3: salt + pepper joined (demo mode only)
  role_id         smallint not null references roles(id),
  totp_secret     text,                                -- 2FA secret, stored encrypted (AES-256-GCM)
  totp_enabled    boolean not null default false,
  last_totp_step  integer not null default 0,          -- stops a 2FA code being used twice
  failed_attempts smallint not null default 0,
  locked_until    timestamptz,
  session_version integer not null default 0,          -- raising it signs the user out everywhere
  created_by      integer references users(id) on delete set null,
  created_at      timestamptz not null default now()
);

create table if not exists records (
  id         serial primary key,
  user_id    integer not null references users(id) on delete cascade,
  title      varchar(150) not null,
  details    text not null,                            -- stored encrypted (AES-256-GCM)
  created_at timestamptz not null default now()
);

create table if not exists audit_log (
  id         serial primary key,
  user_id    integer,
  username   varchar(50),
  action     varchar(60) not null,
  detail     varchar(255),
  ip_address varchar(45),
  created_at timestamptz not null default now()
);

-- Backups: a snapshot of the users and records, stored ENCRYPTED (AES-256-GCM)
-- in the data column. Nobody can read a snapshot without the ENC_KEY setting.
create table if not exists backups (
  id              serial primary key,
  created_at      timestamptz not null default now(),
  created_by      integer references users(id) on delete set null,
  created_by_name varchar(50),
  kind            varchar(30) not null,                -- manual | auto before restore | auto before reset
  users_count     integer not null,
  records_count   integer not null,
  data            text not null                        -- encrypted snapshot
);

-- The first Administrator is created by the website's /setup page, not here,
-- so no default password ever exists.
