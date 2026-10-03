var express = require('express');
var router = express.Router();
var { createHandover } = require('../controllers/handoverController');

router.post('/', createHandover);

module.exports = router;