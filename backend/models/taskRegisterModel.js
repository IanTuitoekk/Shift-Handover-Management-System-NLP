const pool = require('../config/db');

async function createTask({ reportId, description, assignedTo }) {
  const result = await pool.query(
    `INSERT INTO task_register (report_id, description, assigned_to)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [reportId, description, assignedTo || null]
  );
  return result.rows[0];
}

async function getAllTasks(status) {
  const query = status
    ? `SELECT * FROM task_register WHERE status = $1 ORDER BY created_at DESC`
    : `SELECT * FROM task_register ORDER BY created_at DESC`;
  const params = status ? [status] : [];
  const result = await pool.query(query, params);
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

module.exports = {
  createTask,
  getAllTasks,
  getTaskById,
  getTaskByReportId,
  resolveTask,
  assignTask,
};