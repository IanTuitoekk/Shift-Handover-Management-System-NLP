const pool = require('../config/db');
const { shiftExpression } = require('../config/shifts');

// New tasks are due DEFAULT_TASK_DUE_HOURS after they are raised unless a due time is given.
const DEFAULT_TASK_DUE_HOURS = Number(process.env.DEFAULT_TASK_DUE_HOURS) || 12;

async function createTask({ reportId, description, assignedTo, dueAt }) {
  const result = await pool.query(
    `INSERT INTO task_register (report_id, description, assigned_to, due_at)
     VALUES ($1, $2, $3, COALESCE($4::timestamptz, now() + make_interval(hours => $5::int)))
     RETURNING *`,
    [reportId, description, assignedTo || null, dueAt || null, DEFAULT_TASK_DUE_HOURS]
  );
  return result.rows[0];
}

/**
 * Tasks newest first, each with the `shift` ('day' | 'night') of the handover that raised it.
 * Optional filters: `status` and `shift`.
 */
async function getAllTasks(status, shift) {
  const conditions = [];
  const params = [];
  if (status) {
    params.push(status);
    conditions.push(`t.status = $${params.length}`);
  }
  if (shift) {
    params.push(shift);
    conditions.push(`${shiftExpression('s')} = $${params.length}`);
  }
  const result = await pool.query(
    `SELECT t.*, ${shiftExpression('s')} AS shift
     FROM task_register t
     LEFT JOIN handover_reports r ON t.report_id = r.report_id
     LEFT JOIN handover_submissions s ON r.submission_id = s.submission_id
     ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
     ORDER BY t.created_at DESC`,
    params
  );
  return result.rows;
}

async function getTaskById(taskId) {
  const result = await pool.query(`SELECT * FROM task_register WHERE task_id = $1`, [taskId]);
  return result.rows[0];
}

async function getTaskByReportId(reportId) {
  const result = await pool.query(`SELECT * FROM task_register WHERE report_id = $1`, [reportId]);
  return result.rows[0];
}

async function resolveTask(taskId, resolvedBy) {
  const result = await pool.query(
    `UPDATE task_register
     SET status = 'resolved', resolved_by = $1, resolved_at = now(), updated_at = now()
     WHERE task_id = $2
     RETURNING *`,
    [resolvedBy, taskId]
  );
  return result.rows[0];
}

async function assignTask(taskId, assignedTo) {
  const result = await pool.query(
    `UPDATE task_register SET assigned_to = $1, updated_at = now() WHERE task_id = $2 RETURNING *`,
    [assignedTo, taskId]
  );
  return result.rows[0];
}

/** Sets or clears (null) a task's due time. */
async function setTaskDue(taskId, dueAt) {
  const result = await pool.query(
    `UPDATE task_register SET due_at = $1, updated_at = now() WHERE task_id = $2 RETURNING *`,
    [dueAt, taskId]
  );
  return result.rows[0];
}

module.exports = {
  setTaskDue,
  createTask,
  getAllTasks,
  getTaskById,
  getTaskByReportId,
  resolveTask,
  assignTask,
};