require('dotenv').config();
const express  = require('express');
const mongoose = require('mongoose');
const cors     = require('cors');

const app = express();

// Trust Railway's proxy
app.set('trust proxy', 1);

// CORS — allow all origins
app.use(cors({
  origin: '*',
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
  credentials: false
}));
app.options('*', cors());

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check — must be first before any auth
app.get('/', (req, res) => res.json({ status: 'ok', platform: 'SchoolManagement GH' }));
app.get('/api/health', (req, res) => res.json({ status: 'ok', platform: 'SchoolManagement GH', time: new Date().toISOString() }));

// Routes
app.use('/api/super',   require('./routes_superadmin'));
app.use('/api/auth',    require('./routes_auth'));
app.use('/api/school',  require('./routes_school'));
app.use('/api/payment', require('./routes_payment'));

app.use((req, res) => res.status(404).json({ error: 'Route not found' }));
app.use((err, req, res, next) => { console.error(err); res.status(500).json({ error: err.message }); });

const PORT = process.env.PORT || 3000;
mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('MongoDB connected');
    app.listen(PORT, '0.0.0.0', () => console.log('SchoolManagement GH running on port ' + PORT));
  })
  .catch(err => { console.error('MongoDB error:', err.message); process.exit(1); });
