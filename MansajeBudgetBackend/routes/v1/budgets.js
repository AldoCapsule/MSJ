'use strict';
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { verifyFirebaseToken } = require('../../middleware/auth');
const { supabaseForUser } = require('../../db');

router.use(verifyFirebaseToken);

// POST /v1/budgets
router.post('/', async (req, res, next) => {
  const { period_start, period_end, currency, lines } = req.body;
  if (!period_start || !period_end) {
    return res.status(400).json({ error: 'period_start and period_end are required' });
  }
  try {
    const budgetId = uuidv4();
    const { data: budget, error: budgetErr } = await supabaseForUser(req.accessToken)
      .from('budgets')
      .insert({
        id: budgetId,
        user_id: req.uid,
        period_start,
        period_end,
        currency: currency || 'USD',
        status: 'on_track',
      })
      .select()
      .single();
    if (budgetErr) return res.status(500).json({ error: 'Database error' });

    const savedLines = [];
    if (Array.isArray(lines) && lines.length > 0) {
      const lineRows = lines.map(line => ({
        id: uuidv4(),
        budget_id: budgetId,
        user_id: req.uid,
        category_id: line.category_id,
        amount_planned: line.amount_planned || 0,
        amount_actual_cached: 0,
        rollover_enabled: line.rollover_enabled || false,
        rollover_mode: line.rollover_mode || 'reset_each_month',
        rollover_balance: 0,
      }));
      const { data: linesData, error: linesErr } = await supabaseForUser(req.accessToken)
        .from('budget_lines')
        .insert(lineRows)
        .select();
      if (linesErr) return res.status(500).json({ error: 'Database error (lines)' });
      savedLines.push(...linesData);
    }

    res.status(201).json({ budget, lines: savedLines });
  } catch (err) {
    console.error('[BUDGETS] POST error:', err.message);
    next({ status: 500, message: 'Failed to create budget' });
  }
});

// GET /v1/budgets?month=YYYY-MM
router.get('/', async (req, res, next) => {
  try {
    const { month } = req.query;
    let query = supabaseForUser(req.accessToken)
      .from('budgets')
      .select('*, budget_lines(*)');

    if (month) {
      const [year, mon] = month.split('-').map(Number);
      const start = new Date(year, mon - 1, 1).toISOString().slice(0, 10);
      const end = new Date(year, mon, 1).toISOString().slice(0, 10);
      query = query.gte('period_start', start).lt('period_start', end);
    } else {
      query = query.order('period_start', { ascending: false }).limit(12);
    }

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: 'Database error' });
    res.json({ budgets: data });
  } catch (err) {
    console.error('[BUDGETS] GET error:', err.message);
    next({ status: 500, message: 'Failed to fetch budgets' });
  }
});

// PUT /v1/budgets/:id
router.put('/:id', async (req, res, next) => {
  try {
    const allowed = ['period_start', 'period_end', 'currency', 'status'];
    const updates = { updated_at: new Date().toISOString() };
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    const { data, error } = await supabaseForUser(req.accessToken)
      .from('budgets')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error?.code === 'PGRST116') return res.status(404).json({ error: 'Budget not found' });
    if (error) return res.status(500).json({ error: 'Database error' });
    res.json({ budget: data });
  } catch (err) {
    next({ status: 500, message: 'Failed to update budget' });
  }
});

// POST /v1/budget-lines/:lineId/rollover/enable
router.post('/lines/:lineId/rollover/enable', async (req, res, next) => {
  const { rollover_mode } = req.body;
  try {
    const { data, error } = await supabaseForUser(req.accessToken)
      .from('budget_lines')
      .update({
        rollover_enabled: true,
        rollover_mode: rollover_mode || 'carry_forward',
        updated_at: new Date().toISOString(),
      })
      .eq('id', req.params.lineId)
      .select()
      .single();
    if (error?.code === 'PGRST116') return res.status(404).json({ error: 'Budget line not found' });
    if (error) return res.status(500).json({ error: 'Database error' });
    res.json({ success: true, rollover_mode: data.rollover_mode });
  } catch (err) {
    next({ status: 500, message: 'Failed to enable rollover' });
  }
});

// GET /v1/budgets/:id/rollovers
router.get('/:id/rollovers', async (req, res, next) => {
  try {
    const { data: budget, error: budgetErr } = await supabaseForUser(req.accessToken)
      .from('budgets')
      .select('id')
      .eq('id', req.params.id)
      .single();
    if (budgetErr?.code === 'PGRST116') return res.status(404).json({ error: 'Budget not found' });
    if (budgetErr) return res.status(500).json({ error: 'Database error' });

    const { data, error } = await supabaseForUser(req.accessToken)
      .from('rollover_events')
      .select('*')
      .eq('budget_id', req.params.id)
      .order('from_month', { ascending: false });
    if (error) return res.status(500).json({ error: 'Database error' });
    res.json({ rollovers: data });
  } catch (err) {
    next({ status: 500, message: 'Failed to fetch rollovers' });
  }
});

module.exports = router;
