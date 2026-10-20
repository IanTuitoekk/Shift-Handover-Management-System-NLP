const bcrypt = require('bcrypt');
const crypto = require('crypto');

const SALT_ROUNDS = 10;

async function hashPassword(plainPassword) {
  return bcrypt.hash(plainPassword, SALT_ROUNDS);
}

async function verifyPassword(plainPassword, hash) {
  return bcrypt.compare(plainPassword, hash);
}

/** Random secret plus its SHA-256 hash (store the hash, send the secret). */
function generateSecretToken() {
  const token = crypto.randomBytes(32).toString('base64url');
  return { token, hash: hashToken(token) };
}

const hashToken = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');

module.exports = { hashPassword, verifyPassword, generateSecretToken, hashToken };
