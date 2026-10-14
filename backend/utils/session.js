const jwt = require('jsonwebtoken');
const { isTokenRevoked } = require('../models/revokedTokenModel');
const { getUserById } = require('../models/userModel');

/**
 * Verifies a token and loads the user as they are now. Throws with a user-facing message when the
 * token is invalid, revoked, belongs to an inactive account, or predates a password change.
 * Returns { decoded, user }.
 */
async function resolveSession(token) {
  if (await isTokenRevoked(token)) throw new Error('Token has been revoked');
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    throw new Error('Invalid or expired token');
  }
  const user = await getUserById(decoded.userId);
  if (!user || user.is_active === false) throw new Error('Account is no longer active');
  // A password change or reset signs out every session issued before it (iat is in seconds).
  if (user.password_changed_at && decoded.iat < Math.floor(new Date(user.password_changed_at).getTime() / 1000)) {
    throw new Error('Your password was changed. Please log in again.');
  }
  return { decoded, user };
}

module.exports = { resolveSession };
