const pool = require('../config/db');

const FIELDS = `sh.shift_id, sh.name, to_char(sh.start_time, 'HH24:MI') AS start_time, to_char(sh.end_time, 'HH24:MI') AS end_time,
  sh.is_active, sh.updated_at, ub.full_name AS updated_by_name,
  (SELECT COUNT(*)::int FROM handover_submissions s WHERE s.shift_id = sh.shift_id) AS handovers,
  (SELECT COUNT(*)::int FROM shift_plans p WHERE p.shift_id = sh.shift_id) AS plans,
  (SELECT COUNT(*)::int FROM users u WHERE u.shift_id = sh.shift_id) AS rostered`;

/** All shifts (or only active ones), earliest start first, each with how many handovers point at it. */
async function listShifts({ includeInactive = false } = {}) {
  const result = await pool.query(
    `SELECT ${FIELDS} FROM shifts sh LEFT JOIN users ub ON ub.user_id = sh.updated_by
     ${includeInactive ? '' : 'WHERE sh.is_active'}
     ORDER BY sh.is_active DESC, sh.start_time, lower(sh.name)`
  );
  return result.rows;
}

async function getShiftById(shiftId) {
  const result = await pool.query(`SELECT ${FIELDS} FROM shifts sh LEFT JOIN users ub ON ub.user_id = sh.updated_by WHERE sh.shift_id = $1`, [shiftId]);
  return result.rows[0] ?? null;
}

async function createShift({ name, startTime, endTime, by }) {
  const result = await pool.query(
    `INSERT INTO shifts (name, start_time, end_time, updated_by) VALUES ($1, $2, $3, $4) RETURNING shift_id`,
    [name, startTime, endTime, by]
  );
  return getShiftById(result.rows[0].shift_id);
}

/** Changes the given fields ({ name, startTime, endTime, isActive }); others stay as they are. */
async function updateShift(shiftId, { name, startTime, endTime, isActive, by }) {
  await pool.query(
    `UPDATE shifts SET name = COALESCE($2, name), start_time = COALESCE($3::time, start_time),
       end_time = COALESCE($4::time, end_time), is_active = COALESCE($5, is_active), updated_by = $6, updated_at = now()
     WHERE shift_id = $1`,
    [shiftId, name ?? null, startTime ?? null, endTime ?? null, isActive ?? null, by]
  );
  return getShiftById(shiftId);
}

/**
 * Deletes a shift no handover has used, with its plans; people rostered on it become not rostered.
 * Returns { deleted: true, plans_removed, unrostered }, or { deleted: false } if a handover uses it
 * (checked again inside the transaction, and handover_submissions' foreign key refuses it too).
 */
async function deleteShift(shiftId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const used = await client.query(`SELECT 1 FROM handover_submissions WHERE shift_id = $1 LIMIT 1`, [shiftId]);
    if (used.rowCount) {
      await client.query('ROLLBACK');
      return { deleted: false };
    }
    const plans = await client.query(`DELETE FROM shift_plans WHERE shift_id = $1`, [shiftId]);
    const roster = await client.query(`UPDATE users SET shift_id = NULL WHERE shift_id = $1`, [shiftId]);
    await client.query(`DELETE FROM shifts WHERE shift_id = $1`, [shiftId]);
    await client.query('COMMIT');
    return { deleted: true, plans_removed: plans.rowCount, unrostered: roster.rowCount };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { listShifts, getShiftById, createShift, updateShift, deleteShift };
