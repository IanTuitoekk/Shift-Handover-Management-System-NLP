var express = require('express');
var router = express.Router();
var { listTasks, resolve, assign } = require('../controllers/taskController');
var { requireAuth } = require('../middleware/auth');

router.get('/', requireAuth, listTasks);
router.patch('/:taskId/resolve', requireAuth, resolve);
router.patch('/:taskId/assign', requireAuth, assign);

module.exports = router;