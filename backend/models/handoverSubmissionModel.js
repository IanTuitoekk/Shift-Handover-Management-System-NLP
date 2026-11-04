const pool = require('../config/db');

// `shift` is { shift_id, name } or null. Its name is copied, so renaming the shift later doesn't
// change old reports.
async function createSubmission({ userId, inputType, content, languageVariant, shift }) {
  const result = await pool.query(
    `INSERT INTO handover_submissions (user_id, input_type, content, language_variant, shift, shift_id, shift_name)
     VALUES ($1, $2, $3, $4, $5, $6, $5)
     RETURNING *`,
    [userId, inputType, content, languageVariant, shift?.name ?? null, shift?.shift_id ?? null]
  );
  return result.rows[0];
}

async function updateProcessingStatus(submissionId, status) {
  const result = await pool.query(
    `UPDATE handover_submissions SET processing_status = $1 WHERE submission_id = $2 RETURNING *`,
    [status, submissionId]
  );
  return result.rows[0];
}

// The original handover as written. user_id is left out: the report's submitted_by carries it.
async function getSubmissionById(submissionId) {
  const result = await pool.query(
    `SELECT submission_id, input_type, content, language_variant, shift_id, shift_name, processing_status, submitted_at
     FROM handover_submissions WHERE submission_id = $1`,
    [submissionId]
  );
  return result.rows[0] || null;
}

module.exports = { createSubmission, updateProcessingStatus, getSubmissionById };