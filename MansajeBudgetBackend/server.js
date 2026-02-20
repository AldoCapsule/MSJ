require('dotenv').config();
const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');

// Initialize Firebase Admin
const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_PATH
  ? require(process.env.FIREBASE_SERVICE_ACCOUNT_PATH)
  : undefined;

admin.initializeApp(
  serviceAccount
    ? { credential: admin.credential.cert(serviceAccount) }
    : { credential: admin.credential.applicationDefault() }
);

const app = express();

// Middleware
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*',
  methods: ['GET', 'POST', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());

// Routes
const plaidRoutes = require('./routes/plaid');
const webhookRoutes = require('./routes/webhooks');

app.use('/plaid', plaidRoutes);
app.use('/webhooks', webhookRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message, err.stack);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`MansajeBudget backend running on port ${PORT}`);
  console.log(`Plaid environment: ${process.env.PLAID_ENV || 'sandbox'}`);
});
