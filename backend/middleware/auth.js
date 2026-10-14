const { resolveSession } = require('../utils/session');

async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }

  const token = authHeader.split(' ')[1];

  try {
    // Role, active flag and password-change time are read fresh on every request, so changes take
    // effect immediately instead of when the token expires.
    const { decoded, user } = await resolveSession(token);
    req.user = { ...decoded, role: user.role };
    req.token = token; // keep the raw token available for logout
    next();
  } catch (err) {
    return res.status(401).json({ error: err.message });
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
