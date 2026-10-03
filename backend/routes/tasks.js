var express = require('express');
var router = express.Router();
var { listTasks, resolve, assign } = require('../controllers/taskController');
var { requireAuth, requireRole } = require('../middleware/auth');

router.get('/', requireAuth, listTasks);
router.patch('/:taskId/resolve', requireAuth, resolve);
router.patch('/:taskId/assign', requireAuth, requireRole('supervisor'), assign);

module.exports = router;