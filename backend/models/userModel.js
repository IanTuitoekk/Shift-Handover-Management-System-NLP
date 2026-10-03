const pool = require('../config/db');

async function createUser({ fullName, email, passwordHash, role }) {
  const result = await pool.query(
    `INSERT INTO users (full_name, email, password_hash, role)
     VALUES ($1, $2, $3, $4)
     RETURNING user_id, full_name, email, role, is_active, created_at`,
    [fullName, email, passwordHash, role]
  );
  return result.rows[0];
}

async function getUserByEmail(email) {
  const result = await pool.query(`SELECT * FROM users WHERE email = $1`, [email]);
  return result.rows[0];
}

module.exports = { createUser, getUserByEmail };