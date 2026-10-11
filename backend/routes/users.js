var express = require('express');
var router = express.Router();
var { body, param } = require('express-validator');
var { getUsers, setRole } = require('../controllers/userController');
var { requireAuth, requireRole } = require('../middleware/auth');
var { validate } = require('../middleware/validate');
var { ROLES } = require('../config/roles');

router.get('/', requireAuth, requireRole('supervisor'), getUsers);
router.patch(
  '/:userId/role',
  requireAuth,
  requireRole('supervisor'),
  [
    param('userId').isUUID().withMessage('userId must be a valid id'),
    body('role').isIn(ROLES).withMessage(`role must be one of: ${ROLES.join(', ')}`),
  ],
  validate,
  setRole
);

module.exports = router;
