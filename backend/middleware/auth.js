const jwt = require('jsonwebtoken');
const { isTokenRevoked } = require('../models/revokedTokenModel');
const { getUserById } = require('../models/userModel');

async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const revoked = await isTokenRevoked(token);
    if (revoked) {
      return res.status(401).json({ error: 'Token has been revoked' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // Use the role and active flag as they are now, so a role change or deactivation takes effect
    // on the next request instead of when the token expires.
    const current = await getUserById(decoded.userId);
    if (!current || current.is_active === false) {
      return res.status(401).json({ error: 'Account is no longer active' });
    }
    req.user = { ...decoded, role: current.role };
    req.token = token; // keep the raw token available for logout
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };