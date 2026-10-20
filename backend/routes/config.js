var express = require('express');
var router = express.Router();
var { shiftConfig } = require('../config/shifts');

// Shift times are not secret; the app reads them before and after sign-in.
router.get('/shifts', (req, res) => res.json(shiftConfig()));

module.exports = router;
