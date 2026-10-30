const pool = require('../config/db');

const taskPrefix = (category) => `New ${category} incident reported:`;

/**
 * Applies a supervisor's review to a report, in one transaction:
 *   1. the first time, saves what the model said (category, confidence, entities) in report_reviews
 *   2. replaces the report's category and entities with the reviewed ones and marks it reviewed
 *   3. if the category changed, updates the task text that starts "New <category> incident reported:"
 * `entities` is [{ type, text }]. Returns { categoryChanged, task } (task is the updated row or null),
 * or null if the report doesn't exist.
 */
async function saveReview(reportId, { categoryId, entities, reviewerId }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const found = await client.query(
      `SELECT r.category_id, c.category_name FROM handover_reports r
       LEFT JOIN incident_categories c ON c.category_id = r.category_id
       WHERE r.report_id = $1 FOR UPDATE OF r`,
      [reportId]
    );
    if (!found.rows[0]) {
      await client.query('ROLLBACK');
      return null;
    }
    const before = found.rows[0];

    await client.query(
      `INSERT INTO report_reviews (report_id, model_category_id, model_category_confidence, model_entities)
       SELECT r.report_id, r.category_id, r.category_confidence,
              COALESCE((SELECT jsonb_agg(jsonb_build_object('type', e.entity_type, 'text', e.entity_text, 'confidence', e.confidence) ORDER BY e.id)
                        FROM report_entities e WHERE e.report_id = r.report_id), '[]'::jsonb)
       FROM handover_reports r WHERE r.report_id = $1
       ON CONFLICT (report_id) DO UPDATE SET review_count = report_reviews.review_count + 1`,
      [reportId]
    );

    await client.query(
      `UPDATE handover_reports SET category_id = $2, reviewed_at = now(), reviewed_by = $3, updated_at = now()
       WHERE report_id = $1`,
      [reportId, categoryId, reviewerId]
    );
    await client.query(`DELETE FROM report_entities WHERE report_id = $1`, [reportId]);
    for (const e of entities) {
      // Reviewed entities have no model confidence.
      await client.query(`INSERT INTO report_entities (report_id, entity_type, entity_text) VALUES ($1, $2, $3)`, [
        reportId,
        e.type,
        e.text,
      ]);
    }

    const categoryChanged = before.category_id !== categoryId;
    let task = null;
    if (categoryChanged) {
      const next = await client.query(`SELECT category_name FROM incident_categories WHERE category_id = $1`, [categoryId]);
      const t = await client.query(`SELECT task_id, description FROM task_register WHERE report_id = $1`, [reportId]);
      const old = before.category_name && taskPrefix(before.category_name);
      if (t.rows[0] && old && t.rows[0].description.startsWith(old)) {
        const description = taskPrefix(next.rows[0].category_name) + t.rows[0].description.slice(old.length);
        task = (
          await client.query(`UPDATE task_register SET description = $2, updated_at = now() WHERE task_id = $1 RETURNING *`, [
            t.rows[0].task_id,
            description,
          ])
        ).rows[0];
      }
    }

    await client.query('COMMIT');
    return { categoryChanged, task };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** The review of a report: who, when, how often, and what the model originally said. Null if none. */
async function getReview(reportId) {
  const result = await pool.query(
    `SELECT r.reviewed_at, u.user_id AS reviewer_id, u.full_name AS reviewer_name,
            u.is_active AS reviewer_active, u.anonymised_at IS NOT NULL AS reviewer_anonymised,
            v.review_count, v.first_reviewed_at, v.model_category_confidence, v.model_entities,
            mc.category_name AS model_category_name
     FROM handover_reports r
     JOIN report_reviews v ON v.report_id = r.report_id
     LEFT JOIN users u ON u.user_id = r.reviewed_by
     LEFT JOIN incident_categories mc ON mc.category_id = v.model_category_id
     WHERE r.report_id = $1 AND r.reviewed_at IS NOT NULL`,
    [reportId]
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    reviewed_at: row.reviewed_at,
    reviewed_by: row.reviewer_id
      ? { user_id: row.reviewer_id, full_name: row.reviewer_name, is_active: row.reviewer_active, anonymised: row.reviewer_anonymised }
      : null,
    review_count: row.review_count,
    first_reviewed_at: row.first_reviewed_at,
    model: {
      category_name: row.model_category_name,
      category_confidence: row.model_category_confidence,
      entities: row.model_entities.map((e) => ({ entity_type: e.type, entity_text: e.text, confidence: e.confidence })),
    },
  };
}

/**
 * Every reviewed report with its original text, for exporting as training data (newest first).
 * Optional `since` (ISO time) limits it to reviews from then on.
 */
async function listReviewed({ since = null } = {}) {
  const result = await pool.query(
    `SELECT r.report_id, r.reviewed_at, r.summary, c.category_name,
            s.content AS narrative_text, s.language_variant,
            mc.category_name AS model_category_name, v.model_category_confidence, v.model_entities,
            COALESCE((SELECT jsonb_agg(jsonb_build_object('type', e.entity_type, 'text', e.entity_text) ORDER BY e.id)
                      FROM report_entities e WHERE e.report_id = r.report_id), '[]'::jsonb) AS entities
     FROM handover_reports r
     JOIN report_reviews v ON v.report_id = r.report_id
     JOIN handover_submissions s ON s.submission_id = r.submission_id
     LEFT JOIN incident_categories c ON c.category_id = r.category_id
     LEFT JOIN incident_categories mc ON mc.category_id = v.model_category_id
     WHERE r.reviewed_at IS NOT NULL AND ($1::timestamptz IS NULL OR r.reviewed_at >= $1)
     ORDER BY r.reviewed_at DESC`,
    [since]
  );
  return result.rows;
}

module.exports = { saveReview, getReview, listReviewed };
