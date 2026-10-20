const { registerUser, loginUser, changePassword, requestPasswordReset, resetPasswordWithToken } = require('../services/authService');
const realtime = require('../realtime');
const { signToken } = require('../services/authService');
const { signInWithGoogle, linkWithPassword } = require('../services/googleAuthService');
const { getUserById } = require('../models/userModel');
const { revokeToken } = require('../models/revokedTokenModel');

const register = async (req, res) => {
  // Any `role` in the body is ignored: everyone signs up as ground crew and a supervisor
  // promotes people from the Team page. This stops self-registration as a supervisor.
  const { full_name, email, password } = req.body;
  if (!full_name || !email || !password) {
    return res.status(400).json({ error: 'full_name, email and password are required' });
  }

  try {
    const user = await registerUser({ fullName: full_name, email, password });
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

const updatePassword = async (req, res) => {
  try {
    const result = await changePassword({
      userId: req.user.userId,
      currentPassword: req.body.current_password,
      newPassword: req.body.new_password,
    });
    // The old token stops working; revoke it explicitly as well.
    await revokeToken(req.token);
    res.json(result);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Failed to change password' });
  }
};

// Always the same answer, so this can't be used to find out which emails have accounts.
const forgotPassword = async (req, res) => {
  try {
    await requestPasswordReset(req.body.email);
  } catch (err) {
    console.error(err);
  }
  res.json({ message: 'If that email belongs to an active account, a reset link is on its way.' });
};

const resetPassword = async (req, res) => {
  try {
    const userId = await resetPasswordWithToken(req.body.token, req.body.new_password);
    res.json({ message: 'Password changed. Log in with your new password.' });
    realtime.signOutUser(userId, 'Your password was reset. Log in with your new password.');
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Failed to reset password' });
  }
};

const sendAuthError = (res, err, fallback) => {
  if (err.status) return res.status(err.status).json({ error: err.message });
  console.error(err);
  return res.status(500).json({ error: fallback });
};

// POST /api/auth/google { credential } -> { user, token } or { link_required, link_ticket, email }
const googleSignIn = async (req, res) => {
  try {
    const result = await signInWithGoogle(req.body.credential);
    if (result.linkRequired) {
      return res.json({ link_required: true, link_ticket: result.ticket, email: result.email });
    }
    res.status(result.created ? 201 : 200).json({ user: result.user, token: signToken(result.user), created: Boolean(result.created) });
  } catch (err) {
    sendAuthError(res, err, 'Google sign-in failed');
  }
};

// POST /api/auth/google/link { link_ticket, password } -> { user, token }
const googleLink = async (req, res) => {
  try {
    const { user } = await linkWithPassword(req.body.link_ticket, req.body.password);
    res.json({ user, token: signToken(user) });
  } catch (err) {
    sendAuthError(res, err, 'Linking Google failed');
  }
};

module.exports = { register, login, me, logout, updatePassword, forgotPassword, resetPassword, googleSignIn, googleLink };