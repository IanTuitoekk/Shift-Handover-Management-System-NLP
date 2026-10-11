const userModel = require('../models/userModel');

async function listAssignableUsers() {
  return userModel.listActiveUsers();
}

async function changeRole(userId, role) {
  return userModel.updateUserRole(userId, role);
}

module.exports = { listAssignableUsers, changeRole };
