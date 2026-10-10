const userModel = require('../models/userModel');

async function listAssignableUsers() {
  return userModel.listActiveUsers();
}

module.exports = { listAssignableUsers };