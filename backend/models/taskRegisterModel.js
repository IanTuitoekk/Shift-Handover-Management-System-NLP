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

// A person as shown on a task: deactivated and deleted ("Former employee") people stay visible.
const person = (alias) =>
  `CASE WHEN ${alias}.user_id IS NULL THEN NULL ELSE json_build_object(
     'user_id', ${alias}.user_id, 'full_name', ${alias}.full_name,
     'is_active', ${alias}.is_active, 'anonymised', ${alias}.anonymised_at IS NOT NULL) END`;

// The handover report behind a task (alias `r`, categories `c`).
const REPORT_CONTEXT = `json_build_object(
  'category_name', c.category_name, 'summary', r.summary, 'category_confidence', r.category_confidence::text) AS report`;

/**
 * Tasks newest first, each with the `shift` ('day' | 'night') of the handover that raised it,
 * `report` ({ category_name, summary, category_confidence }) and
 * `assignee` / `resolver` ({ user_id, full_name, is_active, anonymised } or null).
 * Optional filters: `status` and `shift`.
 */
/**
 * Who a new task goes to: the active ground crew member rostered on `shift` ('day' | 'night') with
 * the fewest open tasks, never `excludeUserId` (the person who wrote the handover). Ties go to
 * whoever was last given a task longest ago, so equal crews take turns. Returns a user id, or null
 * if nobody is rostered on that shift.
 */
async function pickAssignee({ shift, excludeUserId = null }) {
  const result = await pool.query(
    `SELECT u.user_id
     FROM users u
     LEFT JOIN task_register t ON t.assigned_to = u.user_id
     WHERE u.role = 'ground_crew' AND u.is_active AND u.anonymised_at IS NULL AND u.shift = $2
       AND ($1::uuid IS NULL OR u.user_id <> $1)
     GROUP BY u.user_id
     ORDER BY COUNT(t.task_id) FILTER (WHERE t.status = 'pending'), MAX(t.created_at) NULLS FIRST, u.user_id
     LIMIT 1`,
    [excludeUserId, shift]
  );
  return result.rows[0]?.user_id ?? null;
}

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
    `SELECT t.*, ${shiftExpression('s')} AS shift, ${person('ua')} AS assignee, ${person('ur')} AS resolver, ${REPORT_CONTEXT}
     FROM task_register t
     LEFT JOIN handover_reports r ON t.report_id = r.report_id
     LEFT JOIN incident_categories c ON r.category_id = c.category_id
     LEFT JOIN handover_submissions s ON r.submission_id = s.submission_id
     LEFT JOIN users ua ON t.assigned_to = ua.user_id
     LEFT JOIN users ur ON t.resolved_by = ur.user_id
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
  const result = await pool.query(
    `SELECT t.*, ${person('ua')} AS assignee, ${person('ur')} AS resolver, ${REPORT_CONTEXT}
     FROM task_register t
     LEFT JOIN handover_reports r ON t.report_id = r.report_id
     LEFT JOIN incident_categories c ON r.category_id = c.category_id
     LEFT JOIN users ua ON t.assigned_to = ua.user_id
     LEFT JOIN users ur ON t.resolved_by = ur.user_id
     WHERE t.report_id = $1`,
    [reportId]
  );
  return result.rows[0];
}

/** Resolves a pending task. Returns undefined if it was already resolved (e.g. by someone else meanwhile). */
async function resolveTask(taskId, resolvedBy) {
  const result = await pool.query(
    `UPDATE task_register
     SET status = 'resolved', resolved_by = $1, resolved_at = now(), updated_at = now()
     WHERE task_id = $2 AND status = 'pending'
     RETURNING *`,
    [resolvedBy, taskId]
  );
  return result.rows[0];
}

/**
 * The assignee says the work is done; the task stays pending until a supervisor signs it off.
 * Returns undefined unless the task is still pending, assigned to `userId` and not already done.
 */
async function markTaskDone(taskId, userId) {
  const result = await pool.query(
    `UPDATE task_register SET done_at = now(), done_by = $1, updated_at = now()
     WHERE task_id = $2 AND status = 'pending' AND assigned_to = $1 AND done_at IS NULL
     RETURNING *`,
    [userId, taskId]
  );
  return result.rows[0];
}

/** A supervisor didn't sign the work off: it goes back to the assignee as open. */
async function sendBackTask(taskId) {
  const result = await pool.query(
    `UPDATE task_register SET done_at = NULL, done_by = NULL, updated_at = now()
     WHERE task_id = $1 AND status = 'pending' AND done_at IS NOT NULL
     RETURNING *`,
    [taskId]
  );
  return result.rows[0];
}

// A new owner starts afresh, so "done" from the previous assignee is cleared.
async function assignTask(taskId, assignedTo) {
  const result = await pool.query(
    `UPDATE task_register SET assigned_to = $1, needs_reassignment = false, updated_at = now(),
       done_at = CASE WHEN assigned_to IS DISTINCT FROM $1 THEN NULL ELSE done_at END,
       done_by = CASE WHEN assigned_to IS DISTINCT FROM $1 THEN NULL ELSE done_by END
     WHERE task_id = $2 RETURNING *`,
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
  pickAssignee,
  getAllTasks,
  getTaskById,
  getTaskByReportId,
  resolveTask,
  markTaskDone,
  sendBackTask,
  assignTask,
};