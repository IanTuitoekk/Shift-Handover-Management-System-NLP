var express = require('express');
var router = express.Router();
var { body } = require('express-validator');
var { listTasks, resolve, assign, setDue } = require('../controllers/taskController');
var { requireAuth, requireRole } = require('../middleware/auth');
var { validate } = require('../middleware/validate');

const dueValidation = [
  body('due_at')
    .optional({ values: 'null' })
    .isISO8601()
    .withMessage('due_at must be an ISO 8601 date-time or null'),
];

router.get('/', requireAuth, listTasks);
router.patch('/:taskId/resolve', requireAuth, resolve);
router.patch('/:taskId/assign', requireAuth, requireRole('supervisor'), assign);
router.patch('/:taskId/due', requireAuth, requireRole('supervisor'), dueValidation, validate, setDue);

module.exports = router;
