var express = require('express');
var router = express.Router();
var { requireAuth } = require('../middleware/auth');
var stats = require('../services/statsService');

// Counts for the supervisor overview (tiles, shift rail, trend, category mix). Every report and task
// is already visible to any signed-in user, so this needs sign-in only.
router.get('/overview', requireAuth, async (req, res, next) => {
  const shifts = req.query.shifts === undefined ? 6 : Number(req.query.shifts);
  if (!Number.isInteger(shifts) || shifts < 1 || shifts > 28) {
    return res.status(400).json({ error: 'shifts must be a whole number from 1 to 28' });
  }
  try {
    res.json(await stats.overview({ trendShifts: shifts }));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
