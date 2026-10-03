const pool = require('../config/db');

async function createReport({ submissionId, summary, categoryId, categoryConfidence }) {
  const result = await pool.query(
    `INSERT INTO handover_reports (submission_id, summary, category_id, category_confidence)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [submissionId, summary, categoryId, categoryConfidence]
  );
  return result.rows[0];
}

async function getReportById(reportId) {
  const result = await pool.query(
    `SELECT r.*, c.category_name
     FROM handover_reports r
     LEFT JOIN incident_categories c ON r.category_id = c.category_id
     WHERE r.report_id = $1`,
    [reportId]
  );
  return result.rows[0];
}

async function getAllReports({ limit = 20, offset = 0 } = {}) {
  const result = await pool.query(
    `SELECT r.*, c.category_name
     FROM handover_reports r
     LEFT JOIN incident_categories c ON r.category_id = c.category_id
     ORDER BY r.generated_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );

  const countResult = await pool.query(`SELECT COUNT(*) FROM handover_reports`);
  const total = parseInt(countResult.rows[0].count, 10);

  return { reports: result.rows, total, limit, offset };
}

module.exports = { createReport, getReportById, getAllReports };