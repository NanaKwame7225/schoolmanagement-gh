const jwt = require('jsonwebtoken');

function requireSchoolAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'No token' });
  try {
    req.user = jwt.verify(header.split(' ')[1], process.env.JWT_SECRET);
    next();
  } catch { res.status(401).json({ error: 'Invalid token' }); }
}

function requireMaster(req, res, next) {
  if (req.user?.role !== 'master') return res.status(403).json({ error: 'Master admin only' });
  next();
}

function requireSuperAdmin(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'No token' });
  try {
    const decoded = jwt.verify(header.split(' ')[1], process.env.JWT_SECRET);
    if (decoded.type !== 'superadmin') return res.status(403).json({ error: 'Super admin only' });
    req.superAdmin = decoded;
    next();
  } catch { res.status(401).json({ error: 'Invalid token' }); }
}

module.exports = { requireSchoolAuth, requireMaster, requireSuperAdmin };
