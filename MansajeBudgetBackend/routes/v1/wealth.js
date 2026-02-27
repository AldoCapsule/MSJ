'use strict';
const express = require('express');
const router = express.Router();
const { verifyFirebaseToken } = require('../../middleware/auth');
const { supabaseForUser, supabaseAdmin } = require('../../db');
const { PlaidApi, PlaidEnvironments, Configuration } = require('plaid');

const plaidClient = new PlaidApi(new Configuration({
  basePath: PlaidEnvironments[process.env.PLAID_ENV || 'sandbox'],
  baseOptions: { headers: {
    'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
    'PLAID-SECRET': process.env.PLAID_SECRET,
  }},
}));

// GET /v1/wealth/net-worth
router.get('/net-worth', verifyFirebaseToken, async (req, res) => {
  try {
    const { data: accounts, error } = await supabaseForUser(req.accessToken)
      .from('accounts')
      .select('type, current_balance')
      .eq('is_hidden', false);
    if (error) return res.status(500).json({ error: 'Database error' });

    const assets = accounts
      .filter(a => ['checking','savings','investment'].includes(a.type))
      .reduce((s, a) => s + (Number(a.current_balance) || 0), 0);
    const liabilities = accounts
      .filter(a => ['credit','loan'].includes(a.type))
      .reduce((s, a) => s + (Number(a.current_balance) || 0), 0);

    res.json({ assets, liabilities, net_worth: assets - liabilities });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /v1/wealth/net-worth/history
router.get('/net-worth/history', verifyFirebaseToken, async (req, res) => {
  try {
    const days = Math.min(parseInt(req.query.days) || 365, 730);
    const { data, error } = await supabaseForUser(req.accessToken)
      .from('net_worth_snapshots')
      .select('snapshot_date, net_worth, total_assets, total_liabilities')
      .order('snapshot_date', { ascending: true })
      .limit(days);
    if (error) return res.status(500).json({ error: 'Database error' });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /v1/wealth/portfolio
router.get('/portfolio', verifyFirebaseToken, async (req, res) => {
  try {
    const { data: connections, error: connErr } = await supabaseForUser(req.accessToken)
      .from('connections')
      .select('id')
      .eq('status', 'active');
    if (connErr) return res.status(500).json({ error: 'Database error' });
    if (!connections?.length) return res.json({ holdings: [], securities: [] });

    const allHoldings = [], allSecurities = [];
    for (const conn of connections) {
      const { data: token } = await supabaseAdmin
        .rpc('get_plaid_token', { p_connection_id: conn.id });
      if (!token) continue;
      try {
        const resp = await plaidClient.investmentsHoldingsGet({ access_token: token });
        allHoldings.push(...resp.data.holdings);
        allSecurities.push(...resp.data.securities);
      } catch (_) { /* skip non-investment connections */ }
    }
    res.json({ holdings: allHoldings, securities: allSecurities });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /v1/wealth/retirement
router.get('/retirement', verifyFirebaseToken, async (req, res) => {
  try {
    const { data, error } = await supabaseForUser(req.accessToken)
      .from('retirement_projections')
      .select('*')
      .eq('user_id', req.uid)
      .maybeSingle();
    if (error) return res.status(500).json({ error: 'Database error' });
    if (!data) return res.json(null);

    const years = data.retirement_age - data.current_age;
    const r = Number(data.expected_annual_return) / 12;
    const n = years * 12;
    const pv = Number(data.current_savings);
    const pmt = Number(data.monthly_contribution);
    const projected = pv * Math.pow(1 + r, n) + pmt * ((Math.pow(1 + r, n) - 1) / r);

    res.json({ ...data, projected_amount: Math.round(projected) });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /v1/wealth/retirement
router.put('/retirement', verifyFirebaseToken, async (req, res) => {
  try {
    const { current_age, retirement_age, current_savings, monthly_contribution,
            expected_annual_return, target_amount } = req.body;
    const { data, error } = await supabaseForUser(req.accessToken)
      .from('retirement_projections')
      .upsert({
        user_id: req.uid, current_age, retirement_age, current_savings,
        monthly_contribution, expected_annual_return, target_amount,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' })
      .select()
      .single();
    if (error) return res.status(500).json({ error: 'Database error' });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /v1/goals/:goalId/milestones
router.get('/:goalId/milestones', verifyFirebaseToken, async (req, res) => {
  try {
    const { data, error } = await supabaseForUser(req.accessToken)
      .from('goal_milestones')
      .select('*')
      .eq('goal_id', req.params.goalId)
      .order('target_amount', { ascending: true });
    if (error) return res.status(500).json({ error: 'Database error' });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /v1/goals/:goalId/milestones
router.post('/:goalId/milestones', verifyFirebaseToken, async (req, res) => {
  try {
    const { name, target_amount } = req.body;
    const { data, error } = await supabaseForUser(req.accessToken)
      .from('goal_milestones')
      .insert({ goal_id: req.params.goalId, user_id: req.uid, name, target_amount })
      .select()
      .single();
    if (error) return res.status(500).json({ error: 'Database error' });
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /v1/goals/:goalId/milestones/:id
router.patch('/:goalId/milestones/:id', verifyFirebaseToken, async (req, res) => {
  try {
    const updates = {};
    if (req.body.is_completed !== undefined) {
      updates.is_completed = req.body.is_completed;
      updates.completed_at = req.body.is_completed ? new Date().toISOString() : null;
    }
    if (req.body.name) updates.name = req.body.name;
    if (req.body.target_amount !== undefined) updates.target_amount = req.body.target_amount;
    const { data, error } = await supabaseForUser(req.accessToken)
      .from('goal_milestones')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error?.code === 'PGRST116') return res.status(404).json({ error: 'Not found' });
    if (error) return res.status(500).json({ error: 'Database error' });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /v1/goals/:goalId/milestones/:id
router.delete('/:goalId/milestones/:id', verifyFirebaseToken, async (req, res) => {
  try {
    const { error } = await supabaseForUser(req.accessToken)
      .from('goal_milestones')
      .delete()
      .eq('id', req.params.id);
    if (error) return res.status(500).json({ error: 'Database error' });
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
