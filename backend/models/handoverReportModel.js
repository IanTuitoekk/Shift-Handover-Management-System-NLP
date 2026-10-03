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

async function getAllReports() {
  const result = await pool.query(
    `SELECT r.*, c.category_name
     FROM handover_reports r
     LEFT JOIN incident_categories c ON r.category_id = c.category_id
     ORDER BY r.generated_at DESC`
  );
  return result.rows;
}

module.exports = { createReport, getReportById, getAllReports };