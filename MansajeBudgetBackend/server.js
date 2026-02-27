require('dotenv').config();

// Validate required env vars at startup — fail fast
require('./db');

const express = require('express');
const cors = require('cors');
const { generalLimiter } = require('./middleware/rateLimiter');

const app = express();

// ── Security / CORS ─────────────────────────────────────────────
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Content-Security-Policy for web clients
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  next();
});

app.use(express.json({
  limit: '1mb',
  verify: (req, _res, buf) => {
    // Capture raw body buffer for Plaid webhook signature verification.
    // Used by middleware/plaidWebhookVerification.js — do not remove.
    req.rawBody = buf;
  },
}));

// General rate limiter on all routes
app.use(generalLimiter);

// ── Legacy Plaid proxy routes (kept for backwards-compat with existing iOS app) ──
const plaidRoutes = require('./routes/plaid');
const webhookRoutes = require('./routes/webhooks');
app.use('/plaid', plaidRoutes);
app.use('/webhooks', webhookRoutes);

// ── v1 API routes ────────────────────────────────────────────────
const { authLimiter } = require('./middleware/rateLimiter');

// Auth endpoints have stricter rate limiting
// (Supabase Auth handles actual auth; these are helper/session endpoints)
app.use('/v1/auth', authLimiter, require('./routes/v1/categories')); // placeholder — auth is Supabase-side

app.use('/v1/categories',    require('./routes/v1/categories'));
app.use('/v1/transactions',  require('./routes/v1/transactions'));
app.use('/v1/transfers',     require('./routes/v1/transactions')); // /v1/transfers/recompute lives in transactions router
app.use('/v1/merchants',     require('./routes/v1/transactions')); // /v1/merchants/* lives in transactions router
app.use('/v1/budgets',       require('./routes/v1/budgets'));
app.use('/v1/budget-lines',  require('./routes/v1/budgets'));
app.use('/v1/goals',         require('./routes/v1/goals'));
app.use('/v1/alerts',        require('./routes/v1/alerts'));
app.use('/v1/accounts',      require('./routes/v1/accounts'));
app.use('/v1/connections',   require('./routes/v1/connections'));
app.use('/v1/reports',       require('./routes/v1/reports'));
app.use('/v1/dashboard',     require('./routes/v1/reports'));
app.use('/v1/exports',       require('./routes/v1/exports'));
app.use('/v1/privacy',       require('./routes/v1/exports'));
app.use('/v1/recurring',     require('./routes/v1/recurring'));
app.use('/v1/insights',      require('./routes/v1/insights'));
app.use('/v1/investments',   require('./routes/v1/investments'));
app.use('/v1/rules',         require('./routes/v1/rules'));
app.use('/v1/wealth',        require('./routes/v1/wealth'));
app.use('/v1/goals/:goalId', require('./routes/v1/wealth')); // milestone sub-routes

// ── Health check ────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: 'v1', timestamp: new Date().toISOString() });
});

// ── 404 handler ─────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ── Global error handler ─────────────────────────────────────────
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
  console.log(`API v1 routes: /v1/*`);
});
