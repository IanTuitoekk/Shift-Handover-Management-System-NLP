var express = require('express');
var router = express.Router();
var { listPlans, getShift, myPlans, savePlanFor } = require('../controllers/shiftPlanController');
var { requireAuth, requireRole } = require('../middleware/auth');

router.get('/', requireAuth, requireRole('supervisor'), listPlans);
router.get('/me', requireAuth, myPlans);
router.get('/:date/:shiftId', requireAuth, requireRole('supervisor'), getShift);
router.put('/:date/:shiftId', requireAuth, requireRole('supervisor'), savePlanFor);

module.exports = router;
