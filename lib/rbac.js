'use strict';
// Role-based access control (RBAC): permissions belong to roles.
// Every API route checks these on the SERVER. Hiding a button is not security.

// Which roles each role is allowed to create.
function creatableRoles(role) {
  if (role === 'manager') return ['inputter'];
  if (role === 'administrator') return ['inputter', 'manager', 'admin'];
  return [];
}

const canDeleteInputters = (role) => role === 'admin' || role === 'administrator';
const canDeleteAnyRecord = (role) => role === 'admin' || role === 'administrator';
const canSeeAllRecords = (role) => role !== 'inputter';
const canViewAudit = (role) => role === 'administrator';
const canRecoverAccounts = (role) => role === 'administrator';   // unlock + reset 2FA

module.exports = {
  creatableRoles,
  canDeleteInputters,
  canDeleteAnyRecord,
  canSeeAllRecords,
  canViewAudit,
  canRecoverAccounts,
};
