const userService = require('../services/userService');
const realtime = require('../realtime');

async function getUsers(req, res, next) {
  try {
    const users = await userService.listAssignableUsers();
    res.json(users);
  } catch (err) {
    next(err);
  }
}

// Supervisor-only. A supervisor cannot change their own role, so the last supervisor can never
// lock everyone out of supervisor features by accident.
async function setRole(req, res, next) {
  const { userId } = req.params;
  const { role } = req.body;
  if (userId === req.user.userId) {
    return res.status(400).json({ error: 'You cannot change your own role' });
  }
  try {
    const user = await userService.changeRole(userId, role);
    if (!user) return res.status(404).json({ error: 'User not found or inactive' });
    res.json(user);
    realtime.toUser(user.user_id, 'user:role-changed', { role: user.role, by: req.user.userId });
    realtime.toRole('supervisor', 'users:changed', { user });
  } catch (err) {
    next(err);
  }
}

module.exports = { getUsers, setRole };
