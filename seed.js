require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');
const { SuperAdmin, School, User, Settings } = require('./models_index');

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Connected');

  // Super Admin (YOU — the platform owner)
  const superPassword = process.env.SUPER_PASSWORD || 'SUPERADMIN2025';
  const hash = await bcrypt.hash(superPassword, 10);
  await SuperAdmin.findOneAndUpdate(
    { username: 'SUPERADMIN' },
    { username: 'SUPERADMIN', password: hash },
    { upsert: true }
  );
  console.log(`✅ Super Admin: SUPERADMIN / ${superPassword}`);

  // Create a demo school (Novelty Montessori)
  const existing = await School.findOne({ slug: 'novelty' });
  if (!existing) {
    const school = await School.create({
      slug: 'novelty', name: 'NOVELTY MONTESSORI SCHOOL',
      phone: '0244 000 000', email: 'info@novelty.edu.gh',
      plan: 'premium', planExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
    });
    await Settings.create({ schoolId: school._id, schoolName: 'NOVELTY MONTESSORI SCHOOL', schoolInitials: 'NMS', phone: '0244 000 000' });
    const adminHash = await bcrypt.hash('SCHOOL2025', 10);
    await User.create({ schoolId: school._id, username: 'ADMIN', password: adminHash, displayName: 'Master Admin', role: 'master' });
    console.log('✅ Demo school: novelty | ADMIN / SCHOOL2025');
  }

  await mongoose.disconnect();
  console.log('\n🎉 Done! Deploy to Railway and set environment variables.');
}

seed().catch(e => { console.error('❌', e.message); process.exit(1); });
