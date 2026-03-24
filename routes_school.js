const router = require('express').Router();
const { requireSchoolAuth } = require('./middleware_auth');
const { Student, Payment, Staff, Settings, Audit, User, LevyType, StudentLevy, LevyPayment } = require('./models_index');

// All routes require school auth — schoolId comes from JWT
const sid = req => req.user.schoolId;

// ── Students ──────────────────────────────────────────────────
router.get('/students', requireSchoolAuth, async (req, res) => {
  try { res.json(await Student.find({ schoolId: sid(req) }).sort({ id: 1 })); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/students', requireSchoolAuth, async (req, res) => {
  try {
    const s = await Student.create({ ...req.body, schoolId: sid(req) });
    await Audit.create({ schoolId: sid(req), time: new Date().toISOString(), user: req.user.displayName, action: 'STUDENT_ADDED', detail: `${s.name} (${s.id})` });
    res.status(201).json(s);
  } catch(e) {
    if (e.code === 11000) return res.status(409).json({ error: 'Student ID exists' });
    res.status(500).json({ error: e.message });
  }
});

router.patch('/students/:id', requireSchoolAuth, async (req, res) => {
  try {
    const s = await Student.findOneAndUpdate({ schoolId: sid(req), id: req.params.id }, req.body, { new: true });
    if (!s) return res.status(404).json({ error: 'Not found' });
    res.json(s);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/students/:id', requireSchoolAuth, async (req, res) => {
  try {
    await Student.findOneAndDelete({ schoolId: sid(req), id: req.params.id });
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Payments ──────────────────────────────────────────────────
router.get('/payments', requireSchoolAuth, async (req, res) => {
  try { res.json(await Payment.find({ schoolId: sid(req) }).sort({ createdAt: -1 })); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/payments', requireSchoolAuth, async (req, res) => {
  try {
    const { studentId, term, amount, mode, date, remarks } = req.body;
    const cashier = req.user.displayName;
    const student = await Student.findOne({ schoolId: sid(req), id: studentId });
    if (!student) return res.status(404).json({ error: 'Student not found' });
    if (student.withdrawn) return res.status(403).json({ error: 'WITHDRAWN' });
    const count = await Payment.countDocuments({ schoolId: sid(req) });
    const txn = `TXN${String(count + 1).padStart(4, '0')}`;
    const payment = await Payment.create({ schoolId: sid(req), txn, studentId, name: student.name, class_: student.class_, term, mode, amount, date, cashier, remarks: remarks || '' });
    const paidField = { 'Term 1': 't1p', 'Term 2': 't2p', 'Term 3': 't3p' }[term];
    if (paidField) await Student.updateOne({ schoolId: sid(req), id: studentId }, { $inc: { [paidField]: amount } });
    await Audit.create({ schoolId: sid(req), time: new Date().toISOString(), user: cashier, action: 'PAYMENT_RECORDED', detail: `${txn} · ${student.name} · GHS ${amount}` });
    res.status(201).json(payment);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/payments/:txn', requireSchoolAuth, async (req, res) => {
  try {
    if (req.user.role !== 'master') return res.status(403).json({ error: 'Master only' });
    const p = await Payment.findOneAndDelete({ schoolId: sid(req), txn: req.params.txn });
    if (!p) return res.status(404).json({ error: 'Not found' });
    const paidField = { 'Term 1': 't1p', 'Term 2': 't2p', 'Term 3': 't3p' }[p.term];
    if (paidField) await Student.updateOne({ schoolId: sid(req), id: p.studentId }, { $inc: { [paidField]: -p.amount } });
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Staff ─────────────────────────────────────────────────────
router.get('/staff', requireSchoolAuth, async (req, res) => {
  try { res.json(await Staff.find({ schoolId: sid(req) }).sort({ id: 1 })); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/staff', requireSchoolAuth, async (req, res) => {
  try { res.status(201).json(await Staff.create({ ...req.body, schoolId: sid(req) })); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

router.patch('/staff/:id', requireSchoolAuth, async (req, res) => {
  try { res.json(await Staff.findOneAndUpdate({ schoolId: sid(req), id: req.params.id }, req.body, { new: true })); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/staff/:id', requireSchoolAuth, async (req, res) => {
  try { await Staff.findOneAndDelete({ schoolId: sid(req), id: req.params.id }); res.json({ success: true }); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Settings ──────────────────────────────────────────────────
router.get('/settings', requireSchoolAuth, async (req, res) => {
  try {
    let s = await Settings.findOne({ schoolId: sid(req) });
    if (!s) s = await Settings.create({ schoolId: sid(req) });
    res.json(s);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.patch('/settings', requireSchoolAuth, async (req, res) => {
  try {
    let s = await Settings.findOne({ schoolId: sid(req) });
    if (!s) s = await Settings.create({ schoolId: sid(req) });
    Object.assign(s, req.body);
    await s.save();
    res.json(s);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Audit ─────────────────────────────────────────────────────
router.get('/audit', requireSchoolAuth, async (req, res) => {
  try { res.json(await Audit.find({ schoolId: sid(req) }).sort({ createdAt: -1 }).limit(500)); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

// ── SMS ───────────────────────────────────────────────────────
router.post('/sms/send', requireSchoolAuth, async (req, res) => {
  const https = require('https');
  try {
    const { to, message, apiKey, senderId } = req.body;
    if (!to || !message || !apiKey) return res.status(400).json({ error: 'to, message, apiKey required' });
    let num = String(to).replace(/[^0-9]/g, '');
    if (num.charAt(0) === '0') num = '233' + num.slice(1);
    const body = JSON.stringify({ recipient: [num], sender: senderId || 'SMS', message, is_schedule: false, schedule_date: '' });
    const options = { hostname: 'api.mnotify.com', path: '/api/sms/quick?key=' + apiKey, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } };
    const result = await new Promise((resolve, reject) => {
      const r = https.request(options, res2 => { let d = ''; res2.on('data', c => d += c); res2.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve({ raw: d }); } }); });
      r.on('error', reject); r.write(body); r.end();
    });
    res.json({ success: result.status === 'success', code: result.code, result });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── School info (public — no auth needed for login screen) ──────
router.get('/school-info', async (req, res) => {
  try {
    const { School } = require('./models_index');
    // Try to find by slug from query param first (for login screen before auth)
    const slug = req.query.slug;
    let school;
    if (slug) {
      school = await School.findOne({ slug });
    } else if (req.user) {
      school = await School.findById(sid(req));
    }
    if (!school) return res.status(404).json({ error: 'Not found' });
    res.json({ name: school.name, slug: school.slug, plan: school.plan, planExpiry: school.planExpiry, active: school.active });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Audit Fraud ───────────────────────────────────────────────
router.get('/audit/fraud', requireSchoolAuth, async (req, res) => {
  try {
    const fraudActions = ['FRAUD','WITHDRAWN','DUPLICATE','TAMPER','INVALID'];
    const query = { schoolId: sid(req), action: { $in: fraudActions.map(a => new RegExp(a, 'i')) } };
    res.json(await Audit.find({ schoolId: sid(req) }).sort({ createdAt: -1 }).limit(200));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Users ─────────────────────────────────────────────────────
router.get('/auth/users', requireSchoolAuth, async (req, res) => {
  try {
    if (req.user.role !== 'master') return res.status(403).json({ error: 'Master only' });
    const users = await User.find({ schoolId: sid(req) }).select('-password');
    res.json(users);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/auth/users', requireSchoolAuth, async (req, res) => {
  try {
    if (req.user.role !== 'master') return res.status(403).json({ error: 'Master only' });
    const bcrypt = require('bcryptjs');
    const { username, password, displayName, role } = req.body;
    const hash = await bcrypt.hash(password, 10);
    const user = await User.create({ schoolId: sid(req), username: username.toUpperCase(), password: hash, displayName, role: role || 'admin', active: true });
    res.status(201).json({ ...user.toObject(), password: undefined });
  } catch(e) {
    if (e.code === 11000) return res.status(409).json({ error: 'Username already exists' });
    res.status(500).json({ error: e.message });
  }
});

router.patch('/auth/users/:id', requireSchoolAuth, async (req, res) => {
  try {
    if (req.user.role !== 'master') return res.status(403).json({ error: 'Master only' });
    const update = { ...req.body };
    if (update.password) {
      const bcrypt = require('bcryptjs');
      update.password = await bcrypt.hash(update.password, 10);
    }
    const user = await User.findOneAndUpdate({ schoolId: sid(req), _id: req.params.id }, update, { new: true }).select('-password');
    res.json(user);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/auth/users/:id', requireSchoolAuth, async (req, res) => {
  try {
    if (req.user.role !== 'master') return res.status(403).json({ error: 'Master only' });
    await User.findOneAndDelete({ schoolId: sid(req), _id: req.params.id });
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Levy Types ────────────────────────────────────────────────
router.get('/levies/types', requireSchoolAuth, async (req, res) => {
  try { res.json(await LevyType.find({ schoolId: sid(req) }).sort({ id: 1 })); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/levies/types', requireSchoolAuth, async (req, res) => {
  try {
    const count = await LevyType.countDocuments({ schoolId: sid(req) });
    const id = 'LT' + String(count + 1).padStart(3, '0');
    res.status(201).json(await LevyType.create({ ...req.body, id, schoolId: sid(req) }));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.patch('/levies/types/:id', requireSchoolAuth, async (req, res) => {
  try { res.json(await LevyType.findOneAndUpdate({ schoolId: sid(req), id: req.params.id }, req.body, { new: true })); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/levies/types/:id', requireSchoolAuth, async (req, res) => {
  try { await LevyType.findOneAndDelete({ schoolId: sid(req), id: req.params.id }); res.json({ success: true }); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Student Levies ────────────────────────────────────────────
router.get('/levies', requireSchoolAuth, async (req, res) => {
  try { res.json(await StudentLevy.find({ schoolId: sid(req) })); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/levies', requireSchoolAuth, async (req, res) => {
  try {
    const count = await StudentLevy.countDocuments({ schoolId: sid(req) });
    const id = 'SL' + String(count + 1).padStart(4, '0');
    res.status(201).json(await StudentLevy.create({ ...req.body, id, schoolId: sid(req) }));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.patch('/levies/:id', requireSchoolAuth, async (req, res) => {
  try { res.json(await StudentLevy.findOneAndUpdate({ schoolId: sid(req), id: req.params.id }, req.body, { new: true })); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Levy Payments ─────────────────────────────────────────────
router.get('/levies/payments', requireSchoolAuth, async (req, res) => {
  try { res.json(await LevyPayment.find({ schoolId: sid(req) }).sort({ createdAt: -1 })); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/levies/payments', requireSchoolAuth, async (req, res) => {
  try {
    const count = await LevyPayment.countDocuments({ schoolId: sid(req) });
    const id = 'LP' + String(count + 1).padStart(4, '0');
    const lp = await LevyPayment.create({ ...req.body, id, cashier: req.user.displayName, schoolId: sid(req) });
    // Update paid amount on student levy
    if (req.body.levyId && req.body.studentId) {
      await StudentLevy.updateOne(
        { schoolId: sid(req), studentId: req.body.studentId, levyId: req.body.levyId },
        { $inc: { paid: req.body.amount || 0 } }
      );
    }
    res.status(201).json(lp);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
