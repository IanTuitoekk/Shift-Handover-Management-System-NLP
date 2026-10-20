const pool = require('../config/db');

/** Stores a new reset link (by hash) and invalidates any earlier unused ones for the same person. */
async function createResetToken(userId, tokenHash, expiresAt) {
  await pool.query(`DELETE FROM password_reset_tokens WHERE user_id = $1`, [userId]);
  await pool.query(`INSERT INTO password_reset_tokens (token_hash, user_id, expires_at) VALUES ($1, $2, $3)`, [
    tokenHash,
    userId,
    expiresAt,
  ]);
}

/**
 * Marks a valid (unused, unexpired) link as used and returns its user_id, atomically, inside the
 * caller's transaction. Returns null when the link is invalid.
 */
async function consumeResetToken(client, tokenHash) {
  const result = await client.query(
    `UPDATE password_reset_tokens SET used_at = now()
     WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
     RETURNING user_id`,
    [tokenHash]
  );
  return result.rows[0]?.user_id ?? null;
}

module.exports = { createResetToken, consumeResetToken };
