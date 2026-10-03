var express = require('express');
var router = express.Router();
var { createHandover } = require('../controllers/handoverController');
var { requireAuth } = require('../middleware/auth');

router.post('/', requireAuth, createHandover);

module.exports = router;