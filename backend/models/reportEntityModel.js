const pool = require('../config/db');

async function createEntities(reportId, entities) {
  if (!entities || entities.length === 0) return [];

  const values = entities
    .map((_, i) => `($1, $${i * 3 + 2}, $${i * 3 + 3}, $${i * 3 + 4})`)
    .join(', ');
  const params = [reportId];
  entities.forEach((e) => params.push(e.type, e.text, e.confidence || null));

  const result = await pool.query(
    `INSERT INTO report_entities (report_id, entity_type, entity_text, confidence)
     VALUES ${values}
     RETURNING *`,
    params
  );
  return result.rows;
}

async function getEntitiesByReportId(reportId) {
  const result = await pool.query(
    `SELECT entity_type, entity_text, confidence FROM report_entities WHERE report_id = $1`,
    [reportId]
  );
  return result.rows;
}

module.exports = { createEntities, getEntitiesByReportId };