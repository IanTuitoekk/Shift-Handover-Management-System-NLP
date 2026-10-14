const pool = require('../config/db');

// Safe to return to clients (never password_hash).
const PUBLIC_FIELDS = `user_id, full_name, email, role, is_active, staff_number, station, created_at,
  deactivated_at, deactivated_by, deactivation_reason, anonymised_at`;

async function createUser({ fullName, email, passwordHash, role }) {
  const result = await pool.query(
    `INSERT INTO users (full_name, email, password_hash, role)
     VALUES ($1, $2, $3, $4)
     RETURNING ${PUBLIC_FIELDS}`,
    [fullName, email, passwordHash, role]
  );
  return result.rows[0];
}

async function getUserByEmail(email) {
  const result = await pool.query(`SELECT * FROM users WHERE email = $1`, [email]);
  return result.rows[0];
}

async function getUserById(userId) {
  const result = await pool.query(`SELECT ${PUBLIC_FIELDS}, password_changed_at FROM users WHERE user_id = $1`, [userId]);
  return result.rows[0];
}

// Minimal fields only, for the supervisor's task assignment dropdown
async function listActiveUsers() {
  const result = await pool.query(
    `SELECT user_id, full_name, role
       FROM users
      WHERE is_active = true
      ORDER BY full_name ASC`
  );
  return result.rows;
}

async function updateUserRole(userId, role) {
  const result = await pool.query(
    `UPDATE users SET role = $1 WHERE user_id = $2 AND is_active = true
     RETURNING user_id, full_name, role`,
    [role, userId]
  );
  return result.rows[0];
}

async function countActiveSupervisors() {
  const result = await pool.query(`SELECT count(*)::int AS n FROM users WHERE role = 'supervisor' AND is_active = true`);
  return result.rows[0].n;
}

/** Everyone, active first, for the supervisor's people screen (with who deactivated them). */
async function listAllUsers() {
  const result = await pool.query(
    `SELECT u.user_id, u.full_name, u.email, u.role, u.is_active, u.staff_number, u.station, u.created_at,
            u.deactivated_at, u.deactivation_reason, u.anonymised_at,
            d.user_id AS deactivated_by_id, d.full_name AS deactivated_by_name
       FROM users u
       LEFT JOIN users d ON u.deactivated_by = d.user_id
      ORDER BY u.anonymised_at IS NOT NULL, u.is_active DESC, u.full_name ASC`
  );
  return result.rows.map(({ deactivated_by_id, deactivated_by_name, ...u }) => ({
    ...u,
    deactivated_by: deactivated_by_id ? { user_id: deactivated_by_id, full_name: deactivated_by_name } : null,
  }));
}

/**
 * Personal details. Only keys present in `changes` are written (staffNumber/station may be null to
 * clear them).
 */
async function updateUserDetails(userId, changes) {
  const columns = { fullName: 'full_name', email: 'email', staffNumber: 'staff_number', station: 'station' };
  const sets = [];
  const params = [userId];
  for (const [key, column] of Object.entries(columns)) {
    if (changes[key] === undefined) continue;
    params.push(changes[key]);
    sets.push(`${column} = $${params.length}`);
  }
  if (sets.length === 0) return getUserById(userId);
  const result = await pool.query(`UPDATE users SET ${sets.join(', ')} WHERE user_id = $1 RETURNING ${PUBLIC_FIELDS}`, params);
  return result.rows[0];
}

/**
 * Deactivates (recording who, when and why) and flags the person's open tasks for reassignment,
 * or reactivates and clears those flags. One transaction.
 */
async function setUserActive(userId, isActive, { by = null, reason = null } = {}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      isActive
        ? `UPDATE users SET is_active = true, deactivated_at = NULL, deactivated_by = NULL, deactivation_reason = NULL
           WHERE user_id = $1 RETURNING ${PUBLIC_FIELDS}`
        : `UPDATE users SET is_active = false, deactivated_at = now(), deactivated_by = $2, deactivation_reason = $3
           WHERE user_id = $1 RETURNING ${PUBLIC_FIELDS}`,
      isActive ? [userId] : [userId, by, reason]
    );
    const flagged = await client.query(
      `UPDATE task_register SET needs_reassignment = $2, updated_at = now()
       WHERE assigned_to = $1 AND status = 'pending' AND needs_reassignment <> $2
       RETURNING task_id`,
      [userId, !isActive]
    );
    await client.query('COMMIT');
    return result.rows[0] ? { user: result.rows[0], taskIds: flagged.rows.map((r) => r.task_id) } : null;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Stores a new password hash; older tokens stop working (password_changed_at). */
async function setUserPassword(userId, passwordHash, db = pool) {
  const result = await db.query(
    `UPDATE users SET password_hash = $2, password_changed_at = now()
     WHERE user_id = $1 RETURNING ${PUBLIC_FIELDS}, password_changed_at`,
    [userId, passwordHash]
  );
  return result.rows[0];
}

async function getPasswordHash(userId) {
  const result = await pool.query(`SELECT password_hash FROM users WHERE user_id = $1`, [userId]);
  return result.rows[0]?.password_hash ?? null;
}

/**
 * Permanently deletes a (deactivated) account in one transaction.
 *   'deleted'    no handovers or tasks: the row goes, with their reads and personal notifications.
 *   'anonymised' has records: the row stays so history stays linked, but name, email, password,
 *                details and reset links are erased; open tasks are unassigned and flagged.
 * `unusableHash` is a hash of a random secret nobody knows. Returns { outcome, taskIds } or null.
 */
async function deleteOrAnonymiseUser(userId, unusableHash) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const found = await client.query(`SELECT user_id FROM users WHERE user_id = $1 FOR UPDATE`, [userId]);
    if (!found.rows[0]) {
      await client.query('ROLLBACK');
      return null;
    }
    const records = await client.query(
      `SELECT EXISTS (SELECT 1 FROM handover_submissions WHERE user_id = $1)
           OR EXISTS (SELECT 1 FROM task_register WHERE assigned_to = $1 OR resolved_by = $1) AS has_records`,
      [userId]
    );

    // Both cases: their read receipts, notifications addressed only to them, and reset links.
    await client.query(`DELETE FROM notification_reads WHERE user_id = $1`, [userId]);
    await client.query(`DELETE FROM notifications WHERE recipient_id = $1`, [userId]);
    await client.query(`DELETE FROM password_reset_tokens WHERE user_id = $1`, [userId]);

    let outcome;
    let taskIds = [];
    if (!records.rows[0].has_records) {
      await client.query(`DELETE FROM users WHERE user_id = $1`, [userId]);
      outcome = 'deleted';
    } else {
      const unassigned = await client.query(
        `UPDATE task_register SET assigned_to = NULL, needs_reassignment = true, updated_at = now()
         WHERE assigned_to = $1 AND status = 'pending' RETURNING task_id`,
        [userId]
      );
      taskIds = unassigned.rows.map((r) => r.task_id);
      await client.query(
        `UPDATE users SET
           full_name = 'Former employee',
           email = 'deleted-' || user_id || '@removed.invalid',
           password_hash = $2,
           password_changed_at = now(),
           staff_number = NULL,
           station = NULL,
           deactivation_reason = NULL,
           is_active = false,
           anonymised_at = now()
         WHERE user_id = $1`,
        [userId, unusableHash]
      );
      outcome = 'anonymised';
    }
    await client.query('COMMIT');
    return { outcome, taskIds };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  createUser,
  getUserByEmail,
  getUserById,
  listActiveUsers,
  updateUserRole,
  countActiveSupervisors,
  listAllUsers,
  updateUserDetails,
  setUserActive,
  setUserPassword,
  getPasswordHash,
  deleteOrAnonymiseUser,
};
