var express = require('express');
var router = express.Router();
var { requireAuth } = require('../middleware/auth');
var stats = require('../services/statsService');

const ENTITY_TYPES = ['AIRCRAFT', 'COMPONENT', 'ROLE', 'LOCATION', 'TASK', 'TIME'];

// GET /api/insights/entities?types=AIRCRAFT,COMPONENT&since=<ISO>&min_reports=2&limit=6
router.get('/entities', requireAuth, async (req, res, next) => {
  const types = String(req.query.types || 'AIRCRAFT,COMPONENT')
    .split(',')
    .map((t) => t.trim().toUpperCase())
    .filter(Boolean);
  if (types.some((t) => !ENTITY_TYPES.includes(t))) {
    return res.status(400).json({ error: `types must be from: ${ENTITY_TYPES.join(', ')}` });
  }
  const since = req.query.since ? new Date(req.query.since) : null;
  if (since && Number.isNaN(since.getTime())) return res.status(400).json({ error: 'since must be an ISO date-time' });
  const minReports = req.query.min_reports === undefined ? 2 : Number(req.query.min_reports);
  const limit = req.query.limit === undefined ? 6 : Number(req.query.limit);
  if (!Number.isInteger(minReports) || minReports < 1 || !Number.isInteger(limit) || limit < 1 || limit > 50) {
    return res.status(400).json({ error: 'min_reports must be 1 or more and limit 1 to 50' });
  }
  try {
    res.json(await stats.recurringEntities({ types, since: since?.toISOString() ?? null, minReports, limit }));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
