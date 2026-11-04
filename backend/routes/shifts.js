var express = require('express');
var router = express.Router();
var { getShifts, addShift, editShift, removeShift } = require('../controllers/shiftController');
var { requireAuth, requireRole } = require('../middleware/auth');

router.get('/', requireAuth, getShifts);
router.post('/', requireAuth, requireRole('supervisor'), addShift);
router.patch('/:shiftId', requireAuth, requireRole('supervisor'), editShift);
router.delete('/:shiftId', requireAuth, requireRole('supervisor'), removeShift);

module.exports = router;
