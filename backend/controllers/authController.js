const { registerUser, loginUser } = require('../services/authService');
const { getUserById } = require('../models/userModel');
const { revokeToken } = require('../models/revokedTokenModel');

const register = async (req, res) => {
  const { full_name, email, password, role } = req.body;
  if (!full_name || !email || !password || !role) {
    return res.status(400).json({ error: 'full_name, email, password, and role are required' });
  }

  try {
    const user = await registerUser({ fullName: full_name, email, password, role });
    res.status(201).json(user);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

const login = async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  try {
    const { user, token } = await loginUser({ email, password });
    res.json({ user, token });
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
};

const me = async (req, res) => {
  try {
    const user = await getUserById(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
};

const logout = async (req, res) => {
  try {
    await revokeToken(req.token);
    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to log out' });
  }
};

module.exports = { register, login, me, logout };