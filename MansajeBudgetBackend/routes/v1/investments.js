const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');
const { PlaidApi, PlaidEnvironments, Configuration } = require('plaid');
const { verifyFirebaseToken } = require('../../middleware/auth');

const db = () => admin.firestore();

const plaidConfig = new Configuration({
  basePath: PlaidEnvironments[process.env.PLAID_ENV || 'sandbox'],
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
      'PLAID-SECRET': process.env.PLAID_SECRET,
    },
  },
});
const plaidClient = new PlaidApi(plaidConfig);

router.use(verifyFirebaseToken);

// GET /v1/investments/holdings
router.get('/holdings', async (req, res, next) => {
  try {
    const snap = await db().collection('users').doc(req.uid).collection('holdings')
      .orderBy('symbol').get();
    const holdings = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    const totalValue = holdings.reduce((s, h) => s + (h.value_current || 0), 0);
    const totalCostBasis = holdings.reduce((s, h) => s + (h.cost_basis || 0), 0);

    res.json({
      holdings,
      total_value: totalValue,
      total_cost_basis: totalCostBasis,
      total_gain_loss: totalValue - totalCostBasis,
      total_return_pct: totalCostBasis > 0 ? (totalValue - totalCostBasis) / totalCostBasis * 100 : 0,
    });
  } catch (err) {
    next({ status: 500, message: 'Failed to fetch holdings' });
  }
});

// GET /v1/investments/performance
router.get('/performance', async (req, res, next) => {
  try {
    const snap = await db().collection('users').doc(req.uid).collection('holdings')
      .orderBy('symbol').get();
    const holdings = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    const performance = holdings.map(h => ({
      id: h.id,
      symbol: h.symbol,
      quantity: h.quantity,
      cost_basis: h.cost_basis,
      value_current: h.value_current,
      gain_loss: (h.value_current || 0) - (h.cost_basis || 0),
      return_pct: h.cost_basis > 0 ? ((h.value_current - h.cost_basis) / h.cost_basis * 100) : 0,
      last_updated: h.last_price_updated_at,
    })).sort((a, b) => b.value_current - a.value_current);

    res.json({ performance });
  } catch (err) {
    next({ status: 500, message: 'Failed to fetch performance' });
  }
});

// POST /v1/investments/sync — sync holdings from Plaid for investment accounts
router.post('/sync', async (req, res, next) => {
  const { connection_id } = req.body;
  if (!connection_id) return res.status(400).json({ error: 'connection_id is required' });

  try {
    const tokenSnap = await db().collection('users').doc(req.uid)
      .collection('plaid_tokens').doc(connection_id).get();
    if (!tokenSnap.exists) return res.status(404).json({ error: 'Connection token not found' });

    const { access_token } = tokenSnap.data();
    const response = await plaidClient.investmentsHoldingsGet({ access_token });
    const { holdings, securities } = response.data;

    const secMap = {};
    for (const sec of (securities || [])) secMap[sec.security_id] = sec;

    const batch = db().batch();
    const holdingsCol = db().collection('users').doc(req.uid).collection('holdings');

    for (const holding of (holdings || [])) {
      const sec = secMap[holding.security_id] || {};
      const ref = holdingsCol.doc(`${holding.account_id}_${holding.security_id}`);
      batch.set(ref, {
        id: ref.id,
        account_id: holding.account_id,
        symbol: sec.ticker_symbol || sec.name || holding.security_id,
        quantity: holding.quantity,
        cost_basis: holding.cost_basis || 0,
        current_price: sec.close_price || 0,
        value_current: holding.institution_value || (holding.quantity * (sec.close_price || 0)),
        last_price_updated_at: admin.firestore.FieldValue.serverTimestamp(),
        user_id: req.uid,
      }, { merge: true });
    }

    if (holdings?.length > 0) await batch.commit();
    res.json({ synced: holdings?.length || 0 });
  } catch (err) {
    console.error('[INVESTMENTS] sync error:', err.response?.data || err.message);
    next({ status: 502, message: 'Failed to sync investments' });
  }
});

module.exports = router;
