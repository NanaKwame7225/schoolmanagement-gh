require('dotenv').config();
const express  = require('express');
const mongoose = require('mongoose');
const cors     = require('cors');

const app = express();
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json({ limit: '10mb' }));

// Routes — using flat file structure
app.use('/api/super',   require('./routes_superadmin'));
app.use('/api/auth',    require('./routes_auth'));
app.use('/api/school',  require('./routes_school'));
app.use('/api/payment', require('./routes_payment'));

app.get('/api/health', (req, res) => res.json({ status: 'ok', platform: 'SchoolManagement GH', time: new Date().toISOString() }));
app.use((req, res) => res.status(404).json({ error: 'Route not found' }));
app.use((err, req, res, next) => { console.error(err); res.status(500).json({ error: err.message }); });

const PORT = process.env.PORT || 3000;
mongoose.connect(process.env.MONGODB_URI)
  .then(() => { console.log('MongoDB connected'); app.listen(PORT, () => console.log('SchoolManagement GH running on port ' + PORT)); })
  .catch(err => { console.error('MongoDB error:', err.message); process.exit(1); });
