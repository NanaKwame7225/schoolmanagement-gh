const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { School, User, Settings, Audit } = require('./models_index');
const { requireSchoolAuth, requireMaster } = require('./middleware_auth');

// Middleware to check school exists, is active and subscription valid
async function checkSchool(req, res, next) {
  try {
    const slug = req.body.schoolSlug || req.query.school || req.headers['x-school-slug'];
    if (!slug) return res.status(400).json({ error: 'School slug required' });
    const school = await School.findOne({ slug: slug.toLowerCase() });
    if (!school) return res.status(404).json({ error: 'School not found' });
    if (!school.active) return res.status(403).json({ error: 'INACTIVE', message: 'This school account has been deactivated. Contact support.' });
    if (school.planExpiry < new Date()) return res.status(403).json({ error: 'EXPIRED', message: 'Subscription expired. Please renew to continue.', schoolId: school._id, slug: school.slug });
    req.school = school;
    next();
  } catch(e) { res.status(500).json({ error: e.message }); }
}

// POST /api/auth/login
router.post('/login', checkSchool, async (req, res) => {
  try {
    const { username, password, adminName } = req.body;
    const user = await User.findOne({ schoolId: req.school._id, username: username?.toUpperCase() });
    if (!user || !user.active) return res.status(401).json({ error: 'Invalid credentials' });
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign(
      { id: user._id, username: user.username, displayName: user.displayName, role: user.role, schoolId: req.school._id, schoolSlug: req.school.slug },
      process.env.JWT_SECRET, { expiresIn: '30d' }
    );
    const settings = await Settings.findOne({ schoolId: req.school._id }) || {};
    await Audit.create({ schoolId: req.school._id, time: new Date().toISOString(), user: adminName, action: 'LOGIN', detail: `${adminName} logged in` });
    res.json({ token, user: { username: user.username, displayName: user.displayName, role: user.role }, settings, school: { name: req.school.name, slug: req.school.slug, plan: req.school.plan, planExpiry: req.school.planExpiry } });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/auth/users
router.get('/users', requireSchoolAuth, requireMaster, async (req, res) => {
  try { res.json(await User.find({ schoolId: req.user.schoolId }, '-password')); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/auth/users
router.post('/users', requireSchoolAuth, requireMaster, async (req, res) => {
  try {
    const { username, password, displayName, role } = req.body;
    const hash = await bcrypt.hash(password, 10);
    const user = await User.create({ schoolId: req.user.schoolId, username: username.toUpperCase(), password: hash, displayName, role: role || 'admin' });
    res.status(201).json({ ...user.toObject(), password: undefined });
  } catch(e) {
    if (e.code === 11000) return res.status(409).json({ error: 'Username already exists' });
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/auth/users/:username
router.patch('/users/:username', requireSchoolAuth, requireMaster, async (req, res) => {
  try {
    const user = await User.findOne({ schoolId: req.user.schoolId, username: req.params.username.toUpperCase() });
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.role === 'master' && req.body.active === false) return res.status(400).json({ error: 'Cannot deactivate master' });
    if (req.body.active !== undefined) user.active = req.body.active;
    if (req.body.displayName) user.displayName = req.body.displayName;
    if (req.body.newPassword) user.password = await bcrypt.hash(req.body.newPassword, 10);
    await user.save();
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/auth/users/:username
router.delete('/users/:username', requireSchoolAuth, requireMaster, async (req, res) => {
  try {
    const user = await User.findOne({ schoolId: req.user.schoolId, username: req.params.username.toUpperCase() });
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.role === 'master') return res.status(400).json({ error: 'Cannot delete master admin' });
    await user.deleteOne();
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
