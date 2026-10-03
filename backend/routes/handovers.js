var express = require('express');
var router = express.Router();
var { body } = require('express-validator');
var { createHandover, getReports, getReport } = require('../controllers/handoverController');
var { requireAuth } = require('../middleware/auth');
var { validate } = require('../middleware/validate');

const handoverValidation = [
  body('narrative_text').trim().notEmpty().withMessage('narrative_text is required'),
];

router.post('/', requireAuth, handoverValidation, validate, createHandover);
router.get('/', requireAuth, getReports);
router.get('/:reportId', requireAuth, getReport);

module.exports = router;