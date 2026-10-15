const pool = require('../config/db');
const { shiftExpression } = require('../config/shifts');

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
  SELECT r.*, c.category_name, ${shiftExpression('s')} AS shift,
         u.user_id AS submitter_id, u.full_name AS submitter_name, u.role AS submitter_role,
         u.is_active AS submitter_active, u.anonymised_at IS NOT NULL AS submitter_anonymised
  FROM handover_reports r
  LEFT JOIN incident_categories c ON r.category_id = c.category_id
  LEFT JOIN handover_submissions s ON r.submission_id = s.submission_id
  LEFT JOIN users u ON s.user_id = u.user_id`;

function withSubmitter(row) {
  if (!row) return row;
  const { submitter_id, submitter_name, submitter_role, submitter_active, submitter_anonymised, ...report } = row;
  return {
    ...report,
    submitted_by: submitter_id
      ? {
          user_id: submitter_id,
          full_name: submitter_name,
          role: submitter_role,
          is_active: submitter_active,
          anonymised: submitter_anonymised,
        }
      : null,
  };
}

async function getReportById(reportId) {
  const result = await pool.query(`${SELECT_REPORT} WHERE r.report_id = $1`, [reportId]);
  return withSubmitter(result.rows[0]);
}

const LOW_CONFIDENCE_THRESHOLD = Number(process.env.LOW_CONFIDENCE_THRESHOLD) || 0.6;

/** SQL: true when a report should be checked by a person (no category, no score, or a low score). */
const NEEDS_REVIEW = `(r.category_id IS NULL OR r.category_confidence IS NULL OR r.category_confidence < ${LOW_CONFIDENCE_THRESHOLD})`;

/**
 * WHERE conditions for the report list. Every value is a bound parameter; `params` is appended to.
 *   submittedBy  user id          shift  'day' | 'night'
 *   category     category name, or 'unclassified'
 *   review       true: only reports that need review (NEEDS_REVIEW); false: only ones that don't
 *   minConfidence / maxConfidence  0..1, max is exclusive (classified reports only)
 *   from / to    ISO times on generated_at, `to` exclusive
 */
function reportConditions(filters, params) {
  const add = (value, sql) => {
    params.push(value);
    return sql.replace('?', `$${params.length}`);
  };
  const c = [];
  if (filters.submittedBy) c.push(add(filters.submittedBy, 's.user_id = ?'));
  if (filters.shift) c.push(add(filters.shift, `${shiftExpression('s')} = ?`));
  if (filters.category === 'unclassified') c.push('r.category_id IS NULL');
  else if (filters.category) c.push(add(filters.category, 'c.category_name = ?'));
  if (filters.review === true) c.push(NEEDS_REVIEW);
  if (filters.review === false) c.push(`NOT ${NEEDS_REVIEW}`);
  if (filters.minConfidence != null) c.push('r.category_id IS NOT NULL', add(filters.minConfidence, 'r.category_confidence >= ?'));
  if (filters.maxConfidence != null) c.push('r.category_id IS NOT NULL', add(filters.maxConfidence, 'r.category_confidence < ?'));
  if (filters.from) c.push(add(filters.from, 'r.generated_at >= ?'));
  if (filters.to) c.push(add(filters.to, 'r.generated_at < ?'));
  return c;
}

const FROM_REPORTS = `FROM handover_reports r
  LEFT JOIN incident_categories c ON r.category_id = c.category_id
  LEFT JOIN handover_submissions s ON r.submission_id = s.submission_id`;

/**
 * Reports matching `filters` (see reportConditions), newest first or, with sort 'confidence',
 * lowest confidence first (unscored first). Also returns:
 *   total         matching reports
 *   needs_review  how many of those need review
 *   shift_counts  { day, night } for the same filters without `shift`
 */
async function getAllReports({ limit = 20, offset = 0, sort = 'newest', ...filters } = {}) {
  const params = [];
  const conditions = reportConditions(filters, params);
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const order =
    sort === 'confidence'
      ? 'r.category_confidence ASC NULLS FIRST, r.generated_at DESC'
      : 'r.generated_at DESC';

  const pageParams = [...params, limit, offset];
  const page = await pool.query(
    `${SELECT_REPORT} ${where} ORDER BY ${order} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    pageParams
  );

  const counts = await pool.query(
    `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE ${NEEDS_REVIEW})::int AS needs_review
     ${FROM_REPORTS} ${where}`,
    params
  );

  const shiftParams = [];
  const shiftConditions = reportConditions({ ...filters, shift: null }, shiftParams);
  const shiftCounts = await pool.query(
    `SELECT ${shiftExpression('s')} AS shift, COUNT(*)::int AS n
     ${FROM_REPORTS} ${shiftConditions.length ? `WHERE ${shiftConditions.join(' AND ')}` : ''}
     GROUP BY 1`,
    shiftParams
  );
  const shift_counts = { day: 0, night: 0 };
  for (const row of shiftCounts.rows) shift_counts[row.shift] = row.n;

  return {
    reports: page.rows.map(withSubmitter),
    total: counts.rows[0].total,
    needs_review: counts.rows[0].needs_review,
    shift_counts,
    limit,
    offset,
  };
}

module.exports = { createReport, getReportById, getAllReports, NEEDS_REVIEW, LOW_CONFIDENCE_THRESHOLD };