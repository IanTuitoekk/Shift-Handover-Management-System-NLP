const pool = require('../config/db');

async function revokeToken(token) {
  await pool.query(
    `INSERT INTO revoked_tokens (token) VALUES ($1) ON CONFLICT DO NOTHING`,
    [token]
  );
}

async function isTokenRevoked(token) {
  const result = await pool.query(`SELECT 1 FROM revoked_tokens WHERE token = $1`, [token]);
  return result.rowCount > 0;
}

module.exports = { revokeToken, isTokenRevoked };