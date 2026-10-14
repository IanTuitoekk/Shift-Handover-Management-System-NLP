var express = require('express');
var router = express.Router();
var rateLimit = require('express-rate-limit');
var { body } = require('express-validator');
var { requireAuth } = require('../middleware/auth');
var { validate } = require('../middleware/validate');
var { register, login, me, logout, updatePassword, forgotPassword, resetPassword } = require('../controllers/authController');



const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many login attempts, please try again later' },
});

// Reset requests and attempts are limited separately from logins.
// Per IP; a whole station may share one address, so not too tight.
const resetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many reset requests, please try again later' },
});
const resetAttemptLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many attempts, please try again later' },
});

const registerValidation = [
  body('full_name').trim().notEmpty().withMessage('full_name is required'),
  body('email').isEmail().withMessage('A valid email is required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
];

const loginValidation = [
  body('email').isEmail().withMessage('A valid email is required'),
  body('password').notEmpty().withMessage('password is required'),
];

router.post('/register', registerValidation, validate, register);
router.post('/login', loginLimiter, loginValidation, validate, login);
router.get('/me', requireAuth, me);
router.post('/logout', requireAuth, logout);
router.post(
  '/change-password',
  requireAuth,
  [
    body('current_password').notEmpty().withMessage('current_password is required'),
    body('new_password').isLength({ min: 8 }).withMessage('The new password must be at least 8 characters'),
  ],
  validate,
  updatePassword
);
router.post(
  '/forgot-password',
  resetLimiter,
  [body('email').trim().isEmail().withMessage('A valid email is required')],
  validate,
  forgotPassword
);
router.post(
  '/reset-password',
  resetAttemptLimiter,
  [
    body('token').isString().notEmpty().withMessage('token is required'),
    body('new_password').isLength({ min: 8 }).withMessage('The new password must be at least 8 characters'),
  ],
  validate,
  resetPassword
);

module.exports = router;