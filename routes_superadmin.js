const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { SuperAdmin, School, User, Settings, Subscription } = require('./models_index');
const { requireSuperAdmin } = require('./middleware_auth');

// POST /api/super/login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const admin = await SuperAdmin.findOne({ username });
    if (!admin) return res.status(401).json({ error: 'Invalid credentials' });
    const ok = await bcrypt.compare(password, admin.password);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ id: admin._id, username: admin.username, type: 'superadmin' }, process.env.JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, username: admin.username });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/super/schools
router.get('/schools', requireSuperAdmin, async (req, res) => {
  try {
    const schools = await School.find().sort({ createdAt: -1 });
    res.json(schools);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/super/schools — add a new school
router.post('/schools', requireSuperAdmin, async (req, res) => {
  try {
    const { name, slug, plan, expiryDays, adminPassword, phone, email, address } = req.body;
    if (!name || !slug || !adminPassword) return res.status(400).json({ error: 'name, slug and adminPassword required' });

    // Create school
    const expiry = new Date(Date.now() + (expiryDays || 30) * 24 * 60 * 60 * 1000);
    const school = await School.create({ name, slug: slug.toLowerCase(), plan: plan || 'trial', planExpiry: expiry, phone, email, address });

    // Create school settings
    await Settings.create({ schoolId: school._id, schoolName: name, phone, email, address });

    // Create master admin for the school
    const hash = await bcrypt.hash(adminPassword, 10);
    await User.create({ schoolId: school._id, username: 'ADMIN', password: hash, displayName: 'Master Admin', role: 'master' });

    res.status(201).json({ school, message: `School created. Login: ADMIN / ${adminPassword}` });
  } catch(e) {
    if (e.code === 11000) return res.status(409).json({ error: 'School slug already exists' });
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/super/schools/:slug
router.patch('/schools/:slug', requireSuperAdmin, async (req, res) => {
  try {
    const school = await School.findOneAndUpdate({ slug: req.params.slug }, req.body, { new: true });
    if (!school) return res.status(404).json({ error: 'School not found' });
    res.json(school);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/super/schools/:slug
router.delete('/schools/:slug', requireSuperAdmin, async (req, res) => {
  try {
    const school = await School.findOne({ slug: req.params.slug });
    if (!school) return res.status(404).json({ error: 'School not found' });
    await school.deleteOne();
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/super/stats
router.get('/stats', requireSuperAdmin, async (req, res) => {
  try {
    const totalSchools = await School.countDocuments();
    const activeSchools = await School.countDocuments({ active: true });
    const expiredSchools = await School.countDocuments({ planExpiry: { $lt: new Date() } });
    const payments = await Subscription.find({ status: 'success' });
    const totalRevenue = payments.reduce((a, p) => a + p.amount, 0);
    res.json({ totalSchools, activeSchools, expiredSchools, totalRevenue });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/super/schools/:slug/extend — manually extend subscription
router.post('/schools/:slug/extend', requireSuperAdmin, async (req, res) => {
  try {
    const { months, plan } = req.body;
    const school = await School.findOne({ slug: req.params.slug });
    if (!school) return res.status(404).json({ error: 'School not found' });
    const base = school.planExpiry > new Date() ? school.planExpiry : new Date();
    school.planExpiry = new Date(base.getTime() + (months || 1) * 30 * 24 * 60 * 60 * 1000);
    if (plan) school.plan = plan;
    school.active = true;
    await school.save();
    res.json({ school, message: `Subscription extended by ${months || 1} month(s)` });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
