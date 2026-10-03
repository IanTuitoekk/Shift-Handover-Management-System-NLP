const pool = require('../config/db');

async function getCategoryByName(categoryName) {
  const result = await pool.query(
    `SELECT * FROM incident_categories WHERE category_name = $1`,
    [categoryName]
  );
  return result.rows[0];
}

module.exports = { getCategoryByName };