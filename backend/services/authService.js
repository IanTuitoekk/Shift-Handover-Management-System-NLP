const { createUser, getUserByEmail } = require('../models/userModel');
const { hashPassword, verifyPassword } = require('../utils/password');

async function registerUser({ fullName, email, password, role }) {
  const existing = await getUserByEmail(email);
  if (existing) {
    throw new Error('A user with this email already exists');
  }

  const passwordHash = await hashPassword(password);
  return createUser({ fullName, email, passwordHash, role });
}

async function loginUser({ email, password }) {
  const user = await getUserByEmail(email);
  if (!user) {
    throw new Error('Invalid email or password');
  }

  const isValid = await verifyPassword(password, user.password_hash);
  if (!isValid) {
    throw new Error('Invalid email or password');
  }

  const { password_hash, ...safeUser } = user;
  return safeUser;
}

module.exports = { registerUser, loginUser };