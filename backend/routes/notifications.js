var express = require('express');
var router = express.Router();
var { listNotifications, markRead } = require('../controllers/notificationController');
var { requireAuth } = require('../middleware/auth');

router.get('/', requireAuth, listNotifications);
router.patch('/:notifId/read', requireAuth, markRead);

module.exports = router;