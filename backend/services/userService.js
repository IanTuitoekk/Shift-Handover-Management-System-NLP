const userModel = require('../models/userModel');
const { hashPassword, generateSecretToken } = require('../utils/password');

const fail = (status, message) => Object.assign(new Error(message), { status });

async function listAssignableUsers() {
  return userModel.listActiveUsers();
}

async function listDirectory() {
  return userModel.listAllUsers();
}

/** Refuses to leave the system without an active supervisor. */
async function assertNotLastSupervisor(target) {
  if (target.role === 'supervisor' && target.is_active && (await userModel.countActiveSupervisors()) <= 1) {
    throw fail(400, 'There must always be at least one active supervisor');
  }
}

async function changeRole(userId, role) {
  const target = await userModel.getUserById(userId);
  if (!target || !target.is_active) return null;
  if (role !== 'supervisor') await assertNotLastSupervisor(target);
  return userModel.updateUserRole(userId, role);
}

/** Personal details of ground crew: full name, email, staff number, station. */
async function updateDetails(userId, changes) {
  const target = await userModel.getUserById(userId);
  if (!target) return null;
  if (target.anonymised_at) throw fail(409, 'This account was deleted and can no longer be edited');
  if (target.role !== 'ground_crew') throw fail(403, 'Supervisors can edit the details of ground crew only');
  if (changes.email) {
    const other = await userModel.getUserByEmail(changes.email);
    if (other && other.user_id !== userId) throw fail(409, 'Another account already uses this email');
  }
  try {
    return await userModel.updateUserDetails(userId, changes);
  } catch (err) {
    if (err.code === '23505' && String(err.constraint).includes('staff_number')) {
      throw fail(409, 'Another account already uses this staff number');
    }
    if (err.code === '23505') throw fail(409, 'Another account already uses this email');
    throw err;
  }
}

async function deactivate(userId, { by, reason }) {
  const target = await userModel.getUserById(userId);
  if (!target) return null;
  if (target.anonymised_at) throw fail(409, 'This account was deleted');
  if (!target.is_active) throw fail(409, 'This account is already deactivated');
  await assertNotLastSupervisor(target);
  return userModel.setUserActive(userId, false, { by, reason: reason || null });
}

async function reactivate(userId) {
  const target = await userModel.getUserById(userId);
  if (!target) return null;
  if (target.anonymised_at) throw fail(409, 'A deleted account cannot be reactivated');
  if (target.is_active) throw fail(409, 'This account is already active');
  return userModel.setUserActive(userId, true);
}

/**
 * Permanent delete, for deactivated ground crew only. Returns { outcome: 'deleted' | 'anonymised',
 * taskIds } (see userModel.deleteOrAnonymiseUser).
 */
async function deletePermanently(userId) {
  const target = await userModel.getUserById(userId);
  if (!target) return null;
  if (target.anonymised_at) throw fail(409, 'This account has already been deleted');
  if (target.role !== 'ground_crew') throw fail(403, 'Supervisor accounts cannot be deleted');
  if (target.is_active) throw fail(409, 'Deactivate the account before deleting it');
  const unusableHash = await hashPassword(generateSecretToken().token);
  return userModel.deleteOrAnonymiseUser(userId, unusableHash);
}

module.exports = { listAssignableUsers, listDirectory, changeRole, updateDetails, deactivate, reactivate, deletePermanently };
