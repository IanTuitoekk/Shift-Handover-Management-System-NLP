var express = require('express');
var router = express.Router();
var { getUsers } = require('../controllers/userController');
var { requireAuth, requireRole } = require('../middleware/auth');

router.get('/', requireAuth, requireRole('supervisor'), getUsers);

module.exports = router;