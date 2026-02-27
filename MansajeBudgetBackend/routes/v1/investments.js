'use strict';
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { PlaidApi, PlaidEnvironments, Configuration } = require('plaid');
const { verifyFirebaseToken } = require('../../middleware/auth');
const { supabaseForUser, supabaseAdmin } = require('../../db');

const plaidClient = new PlaidApi(new Configuration({
  basePath: PlaidEnvironments[process.env.PLAID_ENV || 'sandbox'],
  baseOptions: { headers: {
    'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
    'PLAID-SECRET': process.env.PLAID_SECRET,
  }},
}));

router.use(verifyFirebaseToken);

// GET /v1/investments/holdings
router.get('/holdings', async (req, res, next) => {
  try {
    const { data, error } = await supabaseForUser(req.accessToken)
      .from('holdings')
      .select('*')
      .order('symbol');
    if (error) return res.status(500).json({ error: 'Database error' });

    const holdings = data || [];
    const totalValue = holdings.reduce((s, h) => s + (Number(h.value_current) || 0), 0);
    const totalCostBasis = holdings.reduce((s, h) => s + (Number(h.cost_basis) || 0), 0);

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
    const { data, error } = await supabaseForUser(req.accessToken)
      .from('holdings')
      .select('*')
      .order('symbol');
    if (error) return res.status(500).json({ error: 'Database error' });

    const performance = (data || []).map(h => ({
      id: h.id,
      symbol: h.symbol,
      quantity: h.quantity,
      cost_basis: h.cost_basis,
      value_current: h.value_current,
      gain_loss: (Number(h.value_current) || 0) - (Number(h.cost_basis) || 0),
      return_pct: h.cost_basis > 0
        ? ((h.value_current - h.cost_basis) / h.cost_basis * 100) : 0,
      last_updated: h.last_price_updated_at,
    })).sort((a, b) => b.value_current - a.value_current);

    res.json({ performance });
  } catch (err) {
    next({ status: 500, message: 'Failed to fetch performance' });
  }
});

// POST /v1/investments/sync
router.post('/sync', async (req, res, next) => {
  const { connection_id } = req.body;
  if (!connection_id) return res.status(400).json({ error: 'connection_id is required' });

  try {
    const { data: tokenData, error: tokenErr } = await supabaseAdmin
      .rpc('get_plaid_token', { p_connection_id: connection_id });
    if (tokenErr || !tokenData) return res.status(404).json({ error: 'Connection token not found' });

    const response = await plaidClient.investmentsHoldingsGet({ access_token: tokenData });
    const { holdings, securities } = response.data;

    const secMap = {};
    for (const sec of (securities || [])) secMap[sec.security_id] = sec;

    const rows = (holdings || []).map(holding => {
      const sec = secMap[holding.security_id] || {};
      return {
        id: `${holding.account_id}_${holding.security_id}`,
        user_id: req.uid,
        account_id: holding.account_id,
        symbol: sec.ticker_symbol || sec.name || holding.security_id,
        quantity: holding.quantity,
        cost_basis: holding.cost_basis || 0,
        current_price: sec.close_price || 0,
        value_current: holding.institution_value || (holding.quantity * (sec.close_price || 0)),
        last_price_updated_at: new Date().toISOString(),
      };
    });

    if (rows.length > 0) {
      const { error: upsertErr } = await supabaseForUser(req.accessToken)
        .from('holdings')
        .upsert(rows, { onConflict: 'id' });
      if (upsertErr) return res.status(500).json({ error: 'Database error' });
    }

    res.json({ synced: rows.length });
  } catch (err) {
    console.error('[INVESTMENTS] sync error:', err.response?.data || err.message);
    next({ status: 502, message: 'Failed to sync investments' });
  }
});

module.exports = router;
