require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
app.set('trust proxy', 1);
app.use(cors({ origin: '*', methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'], allowedHeaders: ['Content-Type','Authorization'] }));
app.options('*', cors());
app.use(express.json({ limit: '10mb' }));

app.get('/', (req, res) => res.json({ status: 'ok' }));
app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

app.use('/api/super', require('./routes_superadmin'));
app.use('/api/auth', require('./routes_auth'));
app.use('/api/school', require('./routes_school'));
app.use('/api/payment', require('./routes_payment'));

app.use((req, res) => res.status(404).json({ error: 'Route not found' }));
app.use((err, req, res, next) => { console.error(err); res.status(500).json({ error: err.message }); });

const PORT = process.env.PORT || 3000;
mongoose.connect(process.env.MONGODB_URI)
  .then(() => { app.listen(PORT, '0.0.0.0', () => console.log('Running on ' + PORT)); })
  .catch(err => { console.error(err); process.exit(1); });
