var express = require('express');
var router = express.Router();
var { body } = require('express-validator');
var { listNotifications, markRead, markManyRead } = require('../controllers/notificationController');
var { validate } = require('../middleware/validate');
var { requireAuth } = require('../middleware/auth');

router.get('/', requireAuth, listNotifications);
router.patch(
  '/read',
  requireAuth,
  [
    body().custom((b) => (b.notif_ids === undefined) !== (b.before === undefined)).withMessage('Send either notif_ids or before'),
    body('notif_ids').optional().isArray({ min: 1, max: 500 }).withMessage('notif_ids must be a list of 1 to 500 ids'),
    body('notif_ids.*').optional().isUUID().withMessage('notif_ids must contain notification ids'),
    body('before').optional().isISO8601().withMessage('before must be an ISO date-time'),
  ],
  validate,
  markManyRead
);
router.patch('/:notifId/read', requireAuth, markRead);

module.exports = router;