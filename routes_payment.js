const router = require('express').Router();
const https  = require('https');
const { School, Subscription } = require('../models');

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;

const PLANS = {
  starter:  { name: 'Starter',  price: 15000, months: 1,  maxStudents: 100 },  // GHS 150
  growth:   { name: 'Growth',   price: 30000, months: 1,  maxStudents: 300 },  // GHS 300
  premium:  { name: 'Premium',  price: 50000, months: 1,  maxStudents: 99999 }, // GHS 500
  annual_starter: { name: 'Starter Annual', price: 150000, months: 12, maxStudents: 100 }, // GHS 1500
  annual_premium: { name: 'Premium Annual', price: 500000, months: 12, maxStudents: 99999 }, // GHS 5000
};

// POST /api/payment/initialize — start Paystack payment
router.post('/initialize', async (req, res) => {
  try {
    const { schoolSlug, plan, email } = req.body;
    const school = await School.findOne({ slug: schoolSlug });
    if (!school) return res.status(404).json({ error: 'School not found' });
    const planDetails = PLANS[plan];
    if (!planDetails) return res.status(400).json({ error: 'Invalid plan' });

    const reference = 'SCH_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8).toUpperCase();
    const body = JSON.stringify({
      email: email || school.email || 'school@schoolmanagementgh.com',
      amount: planDetails.price,
      reference,
      currency: 'GHS',
      metadata: { schoolId: school._id.toString(), schoolSlug, plan, months: planDetails.months },
      callback_url: (process.env.FRONTEND_URL || '') + '?school=' + schoolSlug + '&payment=success',
    });

    // Initialize with Paystack
    const paystackRes = await new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.paystack.co',
        path: '/transaction/initialize',
        method: 'POST',
        headers: { Authorization: 'Bearer ' + PAYSTACK_SECRET, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
      };
      const req2 = https.request(options, r => { let d=''; r.on('data',c=>d+=c); r.on('end',()=>resolve(JSON.parse(d))); });
      req2.on('error', reject);
      req2.write(body); req2.end();
    });

    if (!paystackRes.status) return res.status(400).json({ error: 'Payment initialization failed' });

    // Save pending subscription
    await Subscription.create({ schoolId: school._id, reference, amount: planDetails.price / 100, plan, months: planDetails.months });

    res.json({ authorization_url: paystackRes.data.authorization_url, reference, plan: planDetails });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/payment/verify/:reference — verify payment after redirect
router.get('/verify/:reference', async (req, res) => {
  try {
    const reference = req.params.reference;
    // Verify with Paystack
    const paystackRes = await new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.paystack.co',
        path: '/transaction/verify/' + reference,
        method: 'GET',
        headers: { Authorization: 'Bearer ' + PAYSTACK_SECRET }
      };
      const req2 = https.request(options, r => { let d=''; r.on('data',c=>d+=c); r.on('end',()=>resolve(JSON.parse(d))); });
      req2.on('error', reject);
      req2.end();
    });

    if (!paystackRes.data || paystackRes.data.status !== 'success') {
      return res.json({ success: false, message: 'Payment not successful' });
    }

    const sub = await Subscription.findOne({ reference });
    if (!sub) return res.status(404).json({ error: 'Subscription not found' });
    if (sub.status === 'success') return res.json({ success: true, message: 'Already processed' });

    // Activate subscription
    sub.status = 'success';
    sub.paidAt = new Date();
    await sub.save();

    const school = await School.findById(sub.schoolId);
    const base = school.planExpiry > new Date() ? school.planExpiry : new Date();
    school.planExpiry = new Date(base.getTime() + sub.months * 30 * 24 * 60 * 60 * 1000);
    school.plan = sub.plan;
    school.active = true;
    await school.save();

    res.json({ success: true, message: 'Subscription activated!', expiry: school.planExpiry, plan: school.plan });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/payment/webhook — Paystack webhook
router.post('/webhook', async (req, res) => {
  try {
    const event = req.body;
    if (event.event === 'charge.success') {
      const reference = event.data.reference;
      const sub = await Subscription.findOne({ reference });
      if (sub && sub.status !== 'success') {
        sub.status = 'success'; sub.paidAt = new Date(); await sub.save();
        const school = await School.findById(sub.schoolId);
        const base = school.planExpiry > new Date() ? school.planExpiry : new Date();
        school.planExpiry = new Date(base.getTime() + sub.months * 30 * 24 * 60 * 60 * 1000);
        school.plan = sub.plan; school.active = true;
        await school.save();
      }
    }
    res.sendStatus(200);
  } catch(e) { res.sendStatus(200); }
});

// GET /api/payment/plans — list available plans
router.get('/plans', (req, res) => res.json(PLANS));

module.exports = router;
