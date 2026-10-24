'use strict';
// WHAT THIS SYSTEM IS CALLED.
// The security engine (salt + pepper, 2FA, encryption, roles, backup) is the same for
// every kind of organisation. Only the words change. Pick the words with the setting
//   SYSTEM_PROFILE = clinic | school | bank | staff      (default: clinic)
// The website and the phone app both read these words from the server (/api/labels),
// so changing the setting re-labels both of them. No database change is needed:
// the four roles keep their internal names (inputter, manager, admin, administrator).

const DEFS = {
  clinic: {
    appName: 'Novo Care',
    tagline: 'Patient records you can trust, access you control.',
    intro: 'A secure patient records portal with two-factor sign-in and role-based access.',
    record: 'patient note', records: 'patient notes',
    titleLabel: 'Patient (name or number)', detailsLabel: 'Clinical notes (stored encrypted)',
    roles: { inputter: 'Nurse', manager: 'Doctor', admin: 'Records officer', administrator: 'Administrator' },
    rolePlurals: { inputter: 'Nurses', manager: 'Doctors', admin: 'Records officers', administrator: 'Administrators' },
  },
  school: {
    appName: 'Novo School',
    tagline: 'Student results you can trust, access you control.',
    intro: 'A secure results portal with two-factor sign-in and role-based access.',
    record: 'student result', records: 'student results',
    titleLabel: 'Student (name or number)', detailsLabel: 'Subjects and marks (stored encrypted)',
    roles: { inputter: 'Teacher', manager: 'Head of department', admin: 'Exam officer', administrator: 'Administrator' },
    rolePlurals: { inputter: 'Teachers', manager: 'Heads of department', admin: 'Exam officers', administrator: 'Administrators' },
  },
  bank: {
    appName: 'Novo Bank',
    tagline: 'Transactions you can trust, access you control.',
    intro: 'A secure transactions portal with two-factor sign-in and role-based access.',
    record: 'transaction', records: 'transactions',
    titleLabel: 'Customer (name or account number)', detailsLabel: 'Transaction details (stored encrypted)',
    roles: { inputter: 'Teller', manager: 'Branch manager', admin: 'Auditor', administrator: 'Administrator' },
    rolePlurals: { inputter: 'Tellers', manager: 'Branch managers', admin: 'Auditors', administrator: 'Administrators' },
  },
  staff: {
    appName: 'Novo Staff',
    tagline: 'Records you can trust, access you control.',
    intro: 'A secure staff records portal with two-factor sign-in and role-based access.',
    record: 'record', records: 'records',
    titleLabel: 'Title', detailsLabel: 'Details (stored encrypted)',
    roles: { inputter: 'Inputter', manager: 'Manager', admin: 'Admin', administrator: 'Administrator' },
    rolePlurals: { inputter: 'Inputters', manager: 'Managers', admin: 'Admins', administrator: 'Administrators' },
  },
};

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function build(key) {
  const d = DEFS[key] || DEFS.clinic;
  const r = d.roles, p = d.rolePlurals;
  return {
    profile: DEFS[key] ? key : 'clinic',
    appName: d.appName, tagline: d.tagline, intro: d.intro,
    pills: ['Passwords protected with salt + pepper', 'Two-factor sign-in with an authenticator app', cap(d.records) + ' encrypted with AES-256-GCM'],
    record: d.record, records: d.records, Record: cap(d.record), Records: cap(d.records),
    titleLabel: d.titleLabel, detailsLabel: d.detailsLabel,
    roles: r, rolePlurals: p,
    abilities: {
      inputter: ['Add ' + d.records, 'See and delete only your own ' + d.records, 'Change your password'],
      manager: ['Add ' + d.records + " and see everyone's", 'Create ' + r.inputter + ' accounts', 'Back up the data', 'Delete only your own ' + d.records],
      admin: ['See every ' + d.record + ' and delete any of them', 'View and delete ' + r.inputter + ' accounts', 'Back up the data', 'Cannot create accounts or read the audit log'],
      administrator: ['Full control of the system', 'Create ' + p.inputter + ', ' + p.manager + ' and ' + p.admin, 'Unlock accounts, reset 2FA, read and manage the audit log', 'Back up, restore and reset the ' + d.records],
    },
  };
}

// Read at every call, so a changed setting takes effect after a restart (and tests can switch it).
const labels = () => build(String(process.env.SYSTEM_PROFILE || 'clinic').trim().toLowerCase());
const roleLabel = (role) => labels().roles[role] || role;

module.exports = { labels, roleLabel, PROFILES: Object.keys(DEFS) };
