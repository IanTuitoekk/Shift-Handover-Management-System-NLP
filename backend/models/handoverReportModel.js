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

// Who submitted the handover behind each report. Older rows may have no submitter.
const SELECT_REPORT = `
  SELECT r.*, c.category_name,
         u.user_id AS submitter_id, u.full_name AS submitter_name, u.role AS submitter_role
  FROM handover_reports r
  LEFT JOIN incident_categories c ON r.category_id = c.category_id
  LEFT JOIN handover_submissions s ON r.submission_id = s.submission_id
  LEFT JOIN users u ON s.user_id = u.user_id`;

function withSubmitter(row) {
  if (!row) return row;
  const { submitter_id, submitter_name, submitter_role, ...report } = row;
  return {
    ...report,
    submitted_by: submitter_id ? { user_id: submitter_id, full_name: submitter_name, role: submitter_role } : null,
  };
}

async function getReportById(reportId) {
  const result = await pool.query(`${SELECT_REPORT} WHERE r.report_id = $1`, [reportId]);
  return withSubmitter(result.rows[0]);
}

/** Newest first. `submittedBy` (a user id) limits the list to that person's handovers. */
async function getAllReports({ limit = 20, offset = 0, submittedBy = null } = {}) {
  const where = submittedBy ? 'WHERE s.user_id = $3' : '';
  const params = submittedBy ? [limit, offset, submittedBy] : [limit, offset];
  const result = await pool.query(
    `${SELECT_REPORT} ${where} ORDER BY r.generated_at DESC LIMIT $1 OFFSET $2`,
    params
  );

  const countResult = submittedBy
    ? await pool.query(
        `SELECT COUNT(*) FROM handover_reports r
         JOIN handover_submissions s ON r.submission_id = s.submission_id
         WHERE s.user_id = $1`,
        [submittedBy]
      )
    : await pool.query(`SELECT COUNT(*) FROM handover_reports`);
  const total = parseInt(countResult.rows[0].count, 10);

  return { reports: result.rows.map(withSubmitter), total, limit, offset };
}

module.exports = { createReport, getReportById, getAllReports };