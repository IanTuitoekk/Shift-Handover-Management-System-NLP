const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { createUser, getUserByEmail, getUserById, getPasswordHash, setUserPassword } = require('../models/userModel');
const { createResetToken, consumeResetToken } = require('../models/passwordResetModel');
const { hashPassword, verifyPassword, generateSecretToken, hashToken } = require('../utils/password');
const { sendPasswordReset } = require('../utils/mailer');
const { DEFAULT_ROLE } = require('../config/roles');

const RESET_LINK_MINUTES = Number(process.env.PASSWORD_RESET_MINUTES) || 30;

async function registerUser({ fullName, email, password }) {
  const existing = await getUserByEmail(email);
  if (existing) {
    throw new Error('A user with this email already exists');
  }

  const passwordHash = await hashPassword(password);
  return createUser({ fullName, email, passwordHash, role: DEFAULT_ROLE });
}

async function loginUser({ email, password }) {
  const user = await getUserByEmail(email);
  if (!user || !user.is_active) {
    throw new Error('Invalid email or password');
  }

  const isValid = await verifyPassword(password, user.password_hash);
  if (!isValid) {
    throw new Error('Invalid email or password');
  }

  const token = signToken(user);
  const { password_hash, ...safeUser } = user;
  return { user: safeUser, token };
}

// `notBefore` (a Date) makes the token's issued-at no earlier than that moment. After a password
// change it is set from the database's own timestamp, so clock differences between Node and
// PostgreSQL can't make the new token look older than the change.
function signToken(user, notBefore) {
  const now = Math.floor(Date.now() / 1000);
  const iat = notBefore ? Math.max(now, Math.ceil(new Date(notBefore).getTime() / 1000)) : now;
  return jwt.sign({ userId: user.user_id, role: user.role, iat }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });
}

/**
 * Changes the signed-in user's password. Ends every other session (password_changed_at) and
 * returns a fresh token for this one.
 */
async function changePassword({ userId, currentPassword, newPassword }) {
  const hash = await getPasswordHash(userId);
  if (!hash || !(await verifyPassword(currentPassword, hash))) {
    const err = new Error('Your current password is incorrect');
    err.status = 400;
    throw err;
  }
  if (await verifyPassword(newPassword, hash)) {
    const err = new Error('Choose a password different from your current one');
    err.status = 400;
    throw err;
  }
  const user = await setUserPassword(userId, await hashPassword(newPassword));
  return { user, token: signToken(user, user.password_changed_at) };
}

const frontendUrl = () => (process.env.FRONTEND_URL || (process.env.FRONTEND_ORIGIN || 'http://localhost:5173').split(',')[0]).replace(/\/$/, '');

/**
 * "Forgot password": emails a one-time link to an active account. Says nothing about whether the
 * email exists; the caller always answers the same way.
 */
async function requestPasswordReset(email) {
  const user = await getUserByEmail(email);
  if (!user || !user.is_active || user.anonymised_at) return;
  const { token, hash } = generateSecretToken();
  await createResetToken(user.user_id, hash, new Date(Date.now() + RESET_LINK_MINUTES * 60 * 1000));
  const link = `${frontendUrl()}/reset-password?token=${encodeURIComponent(token)}`;
  // Not awaited, so the response time doesn't reveal whether an email was sent.
  sendPasswordReset({ to: user.email, name: user.full_name, link, minutes: RESET_LINK_MINUTES }).catch((err) =>
    console.error('[mail] password reset email failed:', err.message)
  );
}

/**
 * Sets a new password from an emailed link. The link works once, expires, and only for an active
 * account. Every existing session ends (password_changed_at). Returns the user id.
 */
async function resetPasswordWithToken(token, newPassword) {
  const invalid = () => Object.assign(new Error('This reset link is invalid or has expired. Ask for a new one.'), { status: 400 });
  const passwordHash = await hashPassword(newPassword);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const userId = await consumeResetToken(client, hashToken(token));
    const user = userId && (await getUserById(userId));
    if (!user || !user.is_active || user.anonymised_at) {
      await client.query('ROLLBACK');
      throw invalid();
    }
    await setUserPassword(userId, passwordHash, client);
    await client.query(`DELETE FROM password_reset_tokens WHERE user_id = $1 AND token_hash <> $2`, [userId, hashToken(token)]);
    await client.query('COMMIT');
    return userId;
  } catch (err) {
    if (!err.status) await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { registerUser, loginUser, changePassword, requestPasswordReset, resetPasswordWithToken, RESET_LINK_MINUTES };