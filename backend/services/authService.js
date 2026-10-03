const jwt = require('jsonwebtoken');
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

  const token = jwt.sign(
    { userId: user.user_id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN }
  );

  const { password_hash, ...safeUser } = user;
  return { user: safeUser, token };
}

module.exports = { registerUser, loginUser };