var express = require('express');
var router = express.Router();
var multer = require('multer');
var rateLimit = require('express-rate-limit');
var { body, param } = require('express-validator');
var { createHandover, getReports, getReport, transcribeHandover, reviewHandover } = require('../controllers/handoverController');
var { requireAuth, requireRole } = require('../middleware/auth');
var { validate } = require('../middleware/validate');

const handoverValidation = [
  body('narrative_text').trim().notEmpty().withMessage('narrative_text is required'),
  body('input_type').optional().isIn(['text', 'voice']).withMessage('input_type must be text or voice'),
];

// Recordings stay in memory (never written to disk) and are discarded after transcription.
const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_AUDIO_BYTES, files: 1 },
  fileFilter: (req, file, done) => {
    const ok = /^(audio|video)\//.test(file.mimetype) || file.mimetype === 'application/octet-stream';
    done(ok ? null : Object.assign(new Error('Upload an audio recording'), { status: 400 }), ok);
  },
}).single('audio');

function receiveAudio(req, res, next) {
  audioUpload(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Recordings can be up to 10 MB' });
    return res.status(err.status || 400).json({ error: err.message });
  });
}

// Transcription is CPU-heavy: 20 recordings per person per 10 minutes.
const transcribeLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  keyGenerator: (req) => req.user.userId,
  message: { error: 'Too many recordings in a short time. Wait a few minutes or type the handover.' },
});

router.post('/', requireAuth, handoverValidation, validate, createHandover);
router.post(
  '/transcribe',
  requireAuth,
  transcribeLimiter,
  receiveAudio,
  [body('language').optional().isIn(['en', 'sw']).withMessage('language must be en or sw')],
  validate,
  transcribeHandover
);
router.get('/', requireAuth, getReports);
router.get('/:reportId', requireAuth, getReport);

// Supervisors correct the model's category and entities (or confirm them unchanged).
router.put(
  '/:reportId/review',
  requireAuth,
  requireRole('supervisor'),
  [
    param('reportId').isUUID().withMessage('reportId must be a valid id'),
    body('category_name').isString().notEmpty().withMessage('category_name is required'),
    body('entities').isArray({ max: 200 }).withMessage('entities must be a list (up to 200)'),
    body('entities.*.type').isString().withMessage('each entity needs a type'),
    body('entities.*.text').isString().isLength({ max: 300 }).withMessage('each entity needs a text of up to 300 characters'),
  ],
  validate,
  reviewHandover
);

module.exports = router;