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

// Self-registration — public endpoint, no auth required
router.post('/register', async (req, res) => {
  try {
    const { schoolName, contactName, phone, email, plan, role, location, studentCount } = req.body;
    if (!schoolName || !contactName || !phone) return res.status(400).json({ error: 'School name, contact name and phone are required' });

    // Generate unique slug
    const baseSlug = schoolName.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,20);
    const slug = baseSlug + '-' + Date.now().toString().slice(-4);

    // Auto-generate a secure password
    const rawPassword = 'SCH' + Math.random().toString(36).slice(2,6).toUpperCase() + Math.floor(100+Math.random()*900);

    // Create school — active immediately, free trial starts now
    const school = await School.create({
      name: schoolName, slug,
      active: true,
      plan: 'trial',
      planExpiry: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),  // 30-day free trial
      phone, email: email || '',
      pendingApproval: false,
      freeTrialUsed: true,
      contactName, role: role || '', location: location || '', studentCount: studentCount || '',
      registeredAt: new Date(),
      approvedAt: new Date(),
      subscriptionStatus: 'active',
      reminderSent: false,
      subscriptionLog: [
        { event: 'registered', plan: 'trial', notes: 'Self-registered via web form', by: 'self', at: new Date() },
        { event: 'approved',   plan: 'trial', notes: 'Auto-activated — 30-day free trial started', by: 'system', at: new Date() }
      ]
    });

    // Create ADMIN user immediately
    const hash = await bcrypt.hash(rawPassword, 10);
    await User.create({ schoolId: school._id, username: 'ADMIN', password: hash, displayName: contactName || 'Admin', role: 'master', active: true });

    // SMS login credentials to the school's phone
    const loginUrl = 'https://nanakwame7225.github.io/SchoolFees/?school=' + slug;
    const welcomeMsg = `Welcome to SchoolManagement GH! ${schoolName} is now live.
Login URL: ${loginUrl}
Username: ADMIN
Password: ${rawPassword}
Your 30-day free trial starts today. Renew before expiry to keep access.
Support: 0538350574`;
    await sendPlatformSMS(phone, welcomeMsg);

    // Notify super admin via SMS
    const adminPhone = process.env.ADMIN_PHONE || '0538350574';
    const adminMsg = `[New Registration] ${schoolName} | Contact: ${contactName} | Phone: ${phone} | Slug: ${slug} | Auto-activated.`;
    await sendPlatformSMS(adminPhone, adminMsg);

    console.log(`[AUTO-ACTIVATED] ${schoolName} | Slug: ${slug} | Phone: ${phone} | Password: ${rawPassword}`);
    res.json({ success: true, message: 'Your school is live! Login details have been sent to ' + phone, slug, loginUrl });

  } catch(e) {
    if (e.code === 11000) return res.status(409).json({ error: 'A school with that name already exists. Please contact support.' });
    res.status(500).json({ error: e.message });
  }
});

// Get all self-registered schools (for super admin log view)
router.get('/registrations/all', requireSuperAdmin, async (req, res) => {
  try {
    const schools = await School.find({ registeredAt: { $exists: true } }).sort({ registeredAt: -1 }).limit(100);
    res.json(schools);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Keep pending endpoint for backward compatibility — returns empty now
router.get('/registrations/pending', requireSuperAdmin, async (req, res) => {
  res.json([]);
});

// Reset/create school admin user
router.post('/schools/:slug/reset-user', requireSuperAdmin, async (req, res) => {
  try {
    const bcrypt = require('bcryptjs');
    const { User } = require('./models_index');
    const school = await School.findOne({ slug: req.params.slug });
    if (!school) return res.status(404).json({ error: 'School not found' });
    const { username, password, displayName, role } = req.body;
    const hash = await bcrypt.hash(password, 10);
    // Delete existing user with same username for this school
    await User.deleteOne({ schoolId: school._id, username: username.toUpperCase() });
    // Create fresh user
    const user = await User.create({
      schoolId: school._id,
      username: username.toUpperCase(),
      password: hash,
      displayName: displayName || username,
      role: role || 'master',
      active: true
    });
    res.json({ success: true, message: 'User ' + username + ' reset successfully for ' + school.name });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Subscription log for a school ─────────────────────────────────────
router.get('/schools/:slug/sublog', requireSuperAdmin, async (req, res) => {
  try {
    const school = await School.findOne({ slug: req.params.slug });
    if (!school) return res.status(404).json({ error: 'Not found' });
    res.json({ name: school.name, slug: school.slug, subscriptionLog: school.subscriptionLog || [] });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Log a payment / renew subscription ────────────────────────────────
router.post('/schools/:slug/payment', requireSuperAdmin, async (req, res) => {
  try {
    const { amount, plan, months, notes } = req.body;
    const school = await School.findOne({ slug: req.params.slug });
    if (!school) return res.status(404).json({ error: 'Not found' });
    const base = school.planExpiry > new Date() ? school.planExpiry : new Date();
    school.planExpiry = new Date(base.getTime() + (months || 1) * 30 * 24 * 60 * 60 * 1000);
    school.plan = plan || school.plan;
    school.active = true;
    school.subscriptionStatus = 'active';
    school.reminderSent = false;
    school.suspendedAt = null;
    school.subscriptionLog.push({ event: 'renewed', plan: plan||school.plan, amount: amount||0, notes: notes||'Payment logged by super admin', by: 'superadmin', at: new Date() });
    await school.save();
    res.json({ success: true, message: 'Subscription renewed until ' + school.planExpiry.toDateString() });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Manually suspend a school ─────────────────────────────────────────
router.post('/schools/:slug/suspend', requireSuperAdmin, async (req, res) => {
  try {
    const { reason } = req.body;
    const school = await School.findOne({ slug: req.params.slug });
    if (!school) return res.status(404).json({ error: 'Not found' });
    school.active = false;
    school.subscriptionStatus = 'suspended';
    school.suspendedAt = new Date();
    school.suspendReason = reason || 'Manually suspended by admin';
    school.subscriptionLog.push({ event: 'suspended', plan: school.plan, notes: reason||'Manual suspension', by: 'superadmin', at: new Date() });
    await school.save();
    res.json({ success: true, message: school.name + ' suspended' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Reinstate a suspended school ──────────────────────────────────────
router.post('/schools/:slug/reinstate', requireSuperAdmin, async (req, res) => {
  try {
    const { days } = req.body;
    const school = await School.findOne({ slug: req.params.slug });
    if (!school) return res.status(404).json({ error: 'Not found' });
    school.active = true;
    school.subscriptionStatus = 'active';
    school.suspendedAt = null;
    school.reminderSent = false;
    if (days) school.planExpiry = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    school.subscriptionLog.push({ event: 'reinstated', plan: school.plan, notes: 'Reinstated by super admin', by: 'superadmin', at: new Date() });
    await school.save();
    res.json({ success: true, message: school.name + ' reinstated' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Subscription scheduler — call this from a cron or heartbeat ───────
// POST /api/super/scheduler/run  (protected)
router.post('/scheduler/run', requireSuperAdmin, async (req, res) => {
  const results = await runSubscriptionScheduler();
  res.json(results);
});

// ── Scheduler logic (also auto-runs on server startup every 6 hours) ─
// ── Central SMS sender (uses platform Mnotify key) ────────────────────
async function sendPlatformSMS(phone, message) {
  if (!phone) return false;
  const apiKey = process.env.MNOTIFY_KEY || 's6mhqRtYmKUm4Pf3Go6garMmT';
  try {
    const clean = phone.replace(/\s+/g, '').replace(/^\+233/, '0').replace(/^233/, '0');
    const url = 'https://apps.mnotify.net/smsapi?key=' + apiKey
      + '&to=' + encodeURIComponent(clean)
      + '&msg=' + encodeURIComponent(message)
      + '&sender_id=NkaySolutions';
    const https = require('https');
    await new Promise(function(resolve){ https.get(url, resolve).on('error', resolve); });
    console.log('[SMS] Sent to ' + clean);
    return true;
  } catch(e) { console.error('[SMS] Error:', e.message); return false; }
}

async function sendSMSReminder(phone, schoolName, daysLeft) {
  const msg = 'Dear ' + schoolName + ', your SchoolManagement GH subscription expires in '
    + daysLeft + ' day' + (daysLeft!==1?'s':'') + '. Please make payment to continue '
    + 'uninterrupted access. Call 0538350574 to renew. — NkaySolutions';
  return sendPlatformSMS(phone, msg);
}

async function runSubscriptionScheduler() {
  const now = new Date();
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const results = { reminders: 0, suspended: 0, errors: [] };

  try {
    const activeSchools = await School.find({ active: true, pendingApproval: { $ne: true } });

    for (const school of activeSchools) {
      try {
        const expiry = new Date(school.planExpiry);
        const daysLeft = Math.ceil((expiry - now) / (24 * 60 * 60 * 1000));

        // ── Already expired → suspend ──────────────────────────────
        if (daysLeft <= 0) {
          school.active = false;
          school.subscriptionStatus = 'expired';
          school.suspendedAt = now;
          school.suspendReason = 'Subscription expired — no payment received';
          school.subscriptionLog.push({
            event: 'suspended',
            plan: school.plan,
            notes: 'Auto-suspended: subscription expired',
            by: 'system',
            at: now
          });
          await school.save();
          console.log(`[SCHEDULER] Suspended: ${school.name} (expired ${Math.abs(daysLeft)} days ago)`);
          results.suspended++;
          continue;
        }

        // ── 7 days warning — send reminder once ───────────────────
        if (daysLeft <= 7 && !school.reminderSent) {
          const smsSent = await sendSMSReminder(school.phone, school.name, daysLeft);
          school.reminderSent = true;
          school.reminderSentAt = now;
          school.subscriptionLog.push({
            event: 'reminder_sent',
            plan: school.plan,
            notes: `7-day expiry reminder. SMS ${smsSent ? 'sent' : 'not sent (no key)'}. Days left: ${daysLeft}`,
            by: 'system',
            at: now
          });
          await school.save();
          console.log(`[SCHEDULER] Reminder sent: ${school.name} — ${daysLeft} days left. SMS: ${smsSent}`);
          results.reminders++;
        }

      } catch(schoolErr) {
        results.errors.push(school.slug + ': ' + schoolErr.message);
      }
    }
  } catch(e) {
    results.errors.push('Scheduler error: ' + e.message);
  }

  console.log(`[SCHEDULER] Done — ${results.reminders} reminders, ${results.suspended} suspensions, ${results.errors.length} errors`);
  return results;
}

// Auto-run scheduler every 6 hours
setInterval(function() {
  console.log('[SCHEDULER] Running scheduled subscription check...');
  runSubscriptionScheduler();
}, 6 * 60 * 60 * 1000);

// Also run once on startup after 30s (let DB connect first)
setTimeout(function() {
  console.log('[SCHEDULER] Running startup subscription check...');
  runSubscriptionScheduler();
}, 30 * 1000);

module.exports = router;
