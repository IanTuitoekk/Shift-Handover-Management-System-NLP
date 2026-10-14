var express = require('express');
var router = express.Router();
var { body, param } = require('express-validator');
var controller = require('../controllers/userController');
var { requireAuth, requireRole } = require('../middleware/auth');
var { validate } = require('../middleware/validate');
var { ROLES } = require('../config/roles');

// Everything here is supervisor-only.
router.use(requireAuth, requireRole('supervisor'));

const userIdParam = param('userId').isUUID().withMessage('userId must be a valid id');
const optionalText = (field, max) =>
  body(field)
    .optional({ values: 'null' })
    .isString()
    .withMessage(`${field} must be text`)
    .trim()
    .isLength({ max })
    .withMessage(`${field} must be at most ${max} characters`);

router.get('/', controller.getUsers); // assignable people (id, name, role)
router.get('/directory', controller.getDirectory); // everyone, with details and status

// Personal details of a ground crew member.
router.patch(
  '/:userId',
  [
    userIdParam,
    body('full_name').optional().trim().notEmpty().withMessage('full_name cannot be empty').isLength({ max: 255 }),
    body('email').optional().trim().isEmail().withMessage('A valid email is required').normalizeEmail({ gmail_remove_dots: false }),
    optionalText('staff_number', 50),
    optionalText('station', 100),
  ],
  validate,
  controller.updateUser
);

router.patch(
  '/:userId/role',
  [userIdParam, body('role').isIn(ROLES).withMessage(`role must be one of: ${ROLES.join(', ')}`)],
  validate,
  controller.setRole
);

// { active: false, reason? } deactivates; { active: true } reactivates.
router.patch(
  '/:userId/active',
  [userIdParam, body('active').isBoolean().withMessage('active must be true or false').toBoolean(), optionalText('reason', 500)],
  validate,
  controller.setActive
);

// Permanent; deactivated ground crew only.
router.delete('/:userId', [userIdParam], validate, controller.deleteUser);

module.exports = router;
