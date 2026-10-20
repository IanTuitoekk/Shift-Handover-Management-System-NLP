const pool = require('../config/db');
const { shiftAt, recentShifts, operationalDay } = require('../config/shifts');
const { NEEDS_REVIEW } = require('../models/handoverReportModel');

const HOUR = 3600 * 1000;
const window = (s) => ({ key: s.key, name: s.name, start: s.start.toISOString(), end: s.end.toISOString() });

/**
 * Everything the supervisor overview counts, in one query round:
 *   current_shift   the shift now, with its report and low-confidence counts
 *   recent_shifts   the last `trendShifts` shifts (oldest first, ending with the current one), same counts
 *   today           the operational day with reports per hour (24 numbers)
 *   reports         { total, needs_review } across all reports
 *   categories      [{ category_name (null = unclassified), reports }] across all reports, most first
 *   tasks           { open, overdue, unassigned } (unassigned includes tasks needing reassignment)
 * Report times are generated_at; shift windows use SHIFT_TIMEZONE.
 */
async function overview({ at = new Date(), trendShifts = 6 } = {}) {
  const shifts = recentShifts(trendShifts, at);
  const day = operationalDay(at);

  // One COUNT pair per shift window: $1/$2 for the first, $3/$4 for the next, ...
  const params = shifts.flatMap((s) => [s.start, s.end]);
  const columns = shifts
    .map((_, i) => {
      const range = `r.generated_at >= $${2 * i + 1} AND r.generated_at < $${2 * i + 2}`;
      return `COUNT(*) FILTER (WHERE ${range})::int AS s${i}, COUNT(*) FILTER (WHERE ${range} AND ${NEEDS_REVIEW})::int AS l${i}`;
    })
    .join(', ');

  const [perShift, perHour, totals, categories, tasks] = await Promise.all([
    pool.query(`SELECT ${columns} FROM handover_reports r WHERE r.generated_at >= $1`, params),
    pool.query(
      `SELECT FLOOR(EXTRACT(EPOCH FROM r.generated_at - $1::timestamptz) / 3600)::int AS hour, COUNT(*)::int AS n
       FROM handover_reports r WHERE r.generated_at >= $1 AND r.generated_at < $2 GROUP BY 1`,
      [day.start, day.end]
    ),
    pool.query(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE ${NEEDS_REVIEW})::int AS needs_review FROM handover_reports r`),
    pool.query(
      `SELECT c.category_name, COUNT(*)::int AS reports
       FROM handover_reports r LEFT JOIN incident_categories c ON r.category_id = c.category_id
       GROUP BY c.category_name ORDER BY reports DESC, c.category_name`
    ),
    pool.query(
      `SELECT COUNT(*)::int AS open,
              COUNT(*) FILTER (WHERE due_at IS NOT NULL AND due_at < now())::int AS overdue,
              COUNT(*) FILTER (WHERE assigned_to IS NULL OR needs_reassignment)::int AS unassigned
       FROM task_register WHERE status = 'pending'`
    ),
  ]);

  const counts = perShift.rows[0];
  const recent = shifts.map((s, i) => ({ ...window(s), reports: counts[`s${i}`], low_confidence: counts[`l${i}`] }));
  const hours = Math.round((day.end - day.start) / HOUR);
  const reportsPerHour = new Array(hours).fill(0);
  for (const row of perHour.rows) if (row.hour >= 0 && row.hour < hours) reportsPerHour[row.hour] = row.n;

  return {
    generated_at: at.toISOString(),
    current_shift: recent[recent.length - 1],
    recent_shifts: recent,
    today: { start: day.start.toISOString(), end: day.end.toISOString(), reports_per_hour: reportsPerHour },
    reports: totals.rows[0],
    categories: categories.rows,
    tasks: tasks.rows[0],
  };
}

/**
 * Entities mentioned in more than one report: [{ entity_type, entity_text, report_count }], most
 * reports first. Texts are grouped case-insensitively; the most common spelling is returned.
 */
async function recurringEntities({ types, since, minReports = 2, limit = 6 }) {
  const result = await pool.query(
    `WITH mentions AS (
       SELECT DISTINCT e.report_id, e.entity_type, lower(trim(e.entity_text)) AS norm, trim(e.entity_text) AS text
       FROM report_entities e
       JOIN handover_reports r ON r.report_id = e.report_id
       WHERE e.entity_type = ANY($1) AND ($2::timestamptz IS NULL OR r.generated_at >= $2)
     )
     SELECT entity_type,
            mode() WITHIN GROUP (ORDER BY text) AS entity_text,
            COUNT(DISTINCT report_id)::int AS report_count
     FROM mentions
     GROUP BY entity_type, norm
     HAVING COUNT(DISTINCT report_id) >= $3
     ORDER BY report_count DESC, entity_text
     LIMIT $4`,
    [types, since, minReports, limit]
  );
  return result.rows;
}

/**
 * Per active person: open and overdue tasks now, plus tasks resolved and handovers submitted since
 * `since` (default: start of the current shift).
 */
async function workload({ since = shiftAt().start } = {}) {
  const result = await pool.query(
    `SELECT u.user_id, u.full_name, u.role,
            (SELECT COUNT(*)::int FROM task_register t WHERE t.assigned_to = u.user_id AND t.status = 'pending') AS open,
            (SELECT COUNT(*)::int FROM task_register t WHERE t.assigned_to = u.user_id AND t.status = 'pending'
               AND t.due_at IS NOT NULL AND t.due_at < now()) AS overdue,
            (SELECT COUNT(*)::int FROM task_register t WHERE t.resolved_by = u.user_id AND t.resolved_at >= $1) AS resolved_since,
            (SELECT COUNT(*)::int FROM handover_submissions s WHERE s.user_id = u.user_id AND s.submitted_at >= $1) AS handovers_since
     FROM users u
     WHERE u.is_active
     ORDER BY open DESC, u.full_name`,
    [since]
  );
  return { since: new Date(since).toISOString(), people: result.rows };
}

module.exports = { overview, recurringEntities, workload };
