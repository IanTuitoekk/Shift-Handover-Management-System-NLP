const pool = require('../config/db');

async function createSubmission({ userId, inputType, content, languageVariant, shift }) {
  const result = await pool.query(
    `INSERT INTO handover_submissions (user_id, input_type, content, language_variant, shift)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [userId, inputType, content, languageVariant, shift]
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

module.exports = { createSubmission, updateProcessingStatus };