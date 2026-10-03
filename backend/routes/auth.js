var express = require('express');
var router = express.Router();
var rateLimit = require('express-rate-limit');
var { body } = require('express-validator');
var { register, login, me } = require('../controllers/authController');
var { requireAuth } = require('../middleware/auth');
var { validate } = require('../middleware/validate');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many login attempts, please try again later' },
});

const registerValidation = [
  body('full_name').trim().notEmpty().withMessage('full_name is required'),
  body('email').isEmail().withMessage('A valid email is required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('role').trim().notEmpty().withMessage('role is required'),
];

const loginValidation = [
  body('email').isEmail().withMessage('A valid email is required'),
  body('password').notEmpty().withMessage('password is required'),
];

router.post('/register', registerValidation, validate, register);
router.post('/login', loginLimiter, loginValidation, validate, login);
router.get('/me', requireAuth, me);

module.exports = router;