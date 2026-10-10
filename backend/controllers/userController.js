const userService = require('../services/userService');

async function getUsers(req, res, next) {
  try {
    const users = await userService.listAssignableUsers();
    res.json(users);
  } catch (err) {
    next(err);
  }
}

module.exports = { getUsers };