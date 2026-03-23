const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { SuperAdmin, School, User, Settings, Subscription } = require('./models_index');
const { requireSuperAdmin } = require('./middleware_auth');

// POST /api/super/setup — one time setup (creates super admin if none exists)
router.post('/setup', async (req, res) => {
  try {
    const count = await SuperAdmin.countDocuments();
    if (count > 0) return res.status(403).json({ error: 'Setup already done' });
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'username and password required' });
    const hash = await bcrypt.hash(password, 10);
    await SuperAdmin.create({ username: username.toUpperCase(), password: hash });
    res.json({ success: true, message: 'Super admin created. Login: ' + username.toUpperCase() });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/super/login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const admin = await SuperAdmin.findOne({ username: username?.toUpperCase() });
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

// POST /api/super/schools
router.post('/schools', requireSuperAdmin, async (req, res) => {
  try {
    const { name, slug, plan, expiryDays, adminPassword, phone, email, address, mnotifyKey, mnotifySender } = req.body;
    if (!name || !slug || !adminPassword) return res.status(400).json({ error: 'name, slug and adminPassword required' });
    const expiry = new Date(Date.now() + (expiryDays || 30) * 24 * 60 * 60 * 1000);
    const school = await School.create({ name, slug: slug.toLowerCase(), plan: plan || 'trial', planExpiry: expiry, phone, email, address });
    // Save school settings including their own BMS credentials
    await Settings.create({
      schoolId: school._id, schoolName: name, phone, email, address,
      mnotifyKey: mnotifyKey || '',
      mnotifySender: mnotifySender || slug.toUpperCase().slice(0, 11)
    });
    const hash = await bcrypt.hash(adminPassword, 10);
    await User.create({ schoolId: school._id, username: 'ADMIN', password: hash, displayName: 'Master Admin', role: 'master' });
    // Save mnotify settings if provided
    if (mnotifyKey || mnotifySender) {
      await Settings.findOneAndUpdate(
        { schoolId: school._id },
        { mnotifyKey: mnotifyKey || '', mnotifySender: mnotifySender || 'SMS' },
        { new: true }
      );
    }
    res.status(201).json({ school, message: 'School created. Login: ADMIN / ' + adminPassword });
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

// DELETE /api/super/schools/:slug — deletes school and ALL its data
router.delete('/schools/:slug', requireSuperAdmin, async (req, res) => {
  try {
    const { Student, Payment, Staff, Settings, User, Audit, Subscription } = require('./models_index');
    const school = await School.findOne({ slug: req.params.slug });
    if (!school) return res.status(404).json({ error: 'School not found' });
    const id = school._id;
    // Delete all school data
    await Promise.all([
      Student.deleteMany({ schoolId: id }),
      Payment.deleteMany({ schoolId: id }),
      Staff.deleteMany({ schoolId: id }),
      Settings.deleteMany({ schoolId: id }),
      User.deleteMany({ schoolId: id }),
      Audit.deleteMany({ schoolId: id }),
      Subscription.deleteMany({ schoolId: id }),
    ]);
    await school.deleteOne();
    res.json({ success: true, message: 'School and all data deleted permanently' });
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

// GET /api/super/schools/:slug/audit — view school audit log
router.get('/schools/:slug/audit', requireSuperAdmin, async (req, res) => {
  try {
    const { Audit } = require('./models_index');
    const school = await School.findOne({ slug: req.params.slug });
    if (!school) return res.status(404).json({ error: 'School not found' });
    const logs = await Audit.find({ schoolId: school._id }).sort({ createdAt: -1 }).limit(500);
    res.json(logs);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/super/schools/:slug/extend
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
    res.json({ school, message: 'Subscription extended by ' + (months || 1) + ' month(s)' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
