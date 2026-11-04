var express = require('express');
var router = express.Router();
var { shiftConfig } = require('../config/shifts');

// Shift times are not secret; the app reads them before and after sign-in, and takes its shift
// windows from here rather than working them out itself.
router.get('/shifts', (req, res) => res.json(shiftConfig()));

module.exports = router;
