'use strict';
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { verifyFirebaseToken } = require('../../middleware/auth');
const { supabaseForUser, supabaseAdmin } = require('../../db');

router.use(verifyFirebaseToken);

// POST /v1/alerts/rules
router.post('/rules', async (req, res, next) => {
  const { type, params, channel, enabled } = req.body;
  const validTypes = ['budget_threshold', 'low_balance', 'large_txn', 'price_change'];
  if (!type || !validTypes.includes(type)) {
    return res.status(400).json({ error: `type must be one of: ${validTypes.join(', ')}` });
  }
  try {
    const { data, error } = await supabaseForUser(req.accessToken)
      .from('alert_rules')
      .insert({
        id: uuidv4(),
        user_id: req.uid,
        type,
        params: params || {},
        channel: channel || 'push',
        enabled: enabled !== false,
      })
      .select()
      .single();
    if (error) return res.status(500).json({ error: 'Database error' });
    res.status(201).json({ rule: data });
  } catch (err) {
    console.error('[ALERTS] POST rules error:', err.message);
    next({ status: 500, message: 'Failed to create alert rule' });
  }
});

// GET /v1/alerts/rules
router.get('/rules', async (req, res, next) => {
  try {
    const { data, error } = await supabaseForUser(req.accessToken)
      .from('alert_rules')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: 'Database error' });
    res.json({ rules: data });
  } catch (err) {
    next({ status: 500, message: 'Failed to fetch alert rules' });
  }
});

// PATCH /v1/alerts/rules/:id
router.patch('/rules/:id', async (req, res, next) => {
  try {
    const updates = { updated_at: new Date().toISOString() };
    ['type', 'params', 'channel', 'enabled'].forEach(k => {
      if (req.body[k] !== undefined) updates[k] = req.body[k];
    });
    const { data, error } = await supabaseForUser(req.accessToken)
      .from('alert_rules')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error?.code === 'PGRST116') return res.status(404).json({ error: 'Alert rule not found' });
    if (error) return res.status(500).json({ error: 'Database error' });
    res.json({ rule: data });
  } catch (err) {
    next({ status: 500, message: 'Failed to update alert rule' });
  }
});

// GET /v1/alerts/events
router.get('/events', async (req, res, next) => {
  try {
    const { unacknowledged_only } = req.query;
    let query = supabaseForUser(req.accessToken)
      .from('alert_events')
      .select('*')
      .order('fired_at', { ascending: false })
      .limit(100);
    if (unacknowledged_only === 'true') {
      query = query.is('acknowledged_at', null);
    }
    const { data, error } = await query;
    if (error) return res.status(500).json({ error: 'Database error' });
    res.json({ events: data });
  } catch (err) {
    next({ status: 500, message: 'Failed to fetch alert events' });
  }
});

// POST /v1/alerts/events/:id/acknowledge
router.post('/events/:id/acknowledge', async (req, res, next) => {
  try {
    const { data, error } = await supabaseForUser(req.accessToken)
      .from('alert_events')
      .update({ acknowledged_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error?.code === 'PGRST116') return res.status(404).json({ error: 'Alert event not found' });
    if (error) return res.status(500).json({ error: 'Database error' });
    res.json({ success: true });
  } catch (err) {
    next({ status: 500, message: 'Failed to acknowledge alert' });
  }
});

// Internal helper — evaluate and fire budget threshold alerts (called by webhook handlers)
async function evaluateBudgetAlerts(uid) {
  try {
    const { data: rules } = await supabaseAdmin
      .from('alert_rules')
      .select('*')
      .eq('user_id', uid)
      .eq('type', 'budget_threshold')
      .eq('enabled', true);
    if (!rules?.length) return;

    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const monthStart = `${month}-01`;
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().slice(0, 10);

    const { data: budgets } = await supabaseAdmin
      .from('budgets')
      .select('*, budget_lines(*)')
      .eq('user_id', uid)
      .gte('period_start', monthStart)
      .lt('period_start', monthEnd);

    for (const rule of rules) {
      const thresholdPct = rule.params?.threshold_pct || 80;
      const categoryId = rule.params?.category_id;

      for (const budget of (budgets || [])) {
        for (const line of (budget.budget_lines || [])) {
          if (categoryId && line.category_id !== categoryId) continue;
          const progress = line.amount_planned > 0
            ? (line.amount_actual_cached / line.amount_planned) * 100 : 0;
          if (progress >= thresholdPct) {
            await supabaseAdmin.from('alert_events').insert({
              id: uuidv4(),
              user_id: uid,
              alert_rule_id: rule.id,
              fired_at: new Date().toISOString(),
              payload: { category_id: line.category_id, spent: line.amount_actual_cached,
                limit: line.amount_planned, progress_pct: progress },
              acknowledged_at: null,
            });
          }
        }
      }
    }
  } catch (err) {
    console.error('[ALERTS] evaluate error:', err.message);
  }
}

module.exports = router;
module.exports.evaluateBudgetAlerts = evaluateBudgetAlerts;
