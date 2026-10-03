const { registerUser, loginUser } = require('../services/authService');

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
    const user = await loginUser({ email, password });
    res.json(user);
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
};

module.exports = { register, login };