'use strict';
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { verifyFirebaseToken } = require('../../middleware/auth');
const { supabaseForUser } = require('../../db');

router.use(verifyFirebaseToken);

function computeProjection(goal) {
  const now = new Date();
  const targetDate = new Date(goal.target_date);
  const monthsRemaining = Math.max(
    (targetDate.getFullYear() - now.getFullYear()) * 12 + (targetDate.getMonth() - now.getMonth()),
    1
  );
  const currentBalance = goal.current_amount || goal.current_balance || 0;
  const remaining = goal.target_amount - currentBalance;
  const requiredMonthly = remaining / monthsRemaining;
  const contribution = goal.computed_monthly_contribution || 0;
  const onTrack = contribution >= requiredMonthly;

  let projectedDate = null;
  if (contribution > 0) {
    const monthsToGoal = remaining / contribution;
    projectedDate = new Date(now.getFullYear(), now.getMonth() + Math.ceil(monthsToGoal), 1);
  }

  return {
    on_track: onTrack,
    required_monthly: Math.max(requiredMonthly, 0),
    months_remaining: monthsRemaining,
    current_balance: currentBalance,
    remaining_amount: Math.max(remaining, 0),
    projected_completion_date: projectedDate,
    progress_pct: goal.target_amount > 0 ? Math.min(currentBalance / goal.target_amount, 1) : 0,
  };
}

// POST /v1/goals
router.post('/', async (req, res, next) => {
  const { name, type, target_amount, target_date, funding_account_id,
    include_existing_balance, computed_monthly_contribution } = req.body;

  if (!name || !type || !target_amount || !target_date) {
    return res.status(400).json({ error: 'name, type, target_amount, and target_date are required' });
  }
  if (!['savings', 'debt'].includes(type)) {
    return res.status(400).json({ error: 'type must be savings or debt' });
  }
  try {
    const { data, error } = await supabaseForUser(req.accessToken)
      .from('goals')
      .insert({
        id: uuidv4(),
        user_id: req.uid,
        name,
        type,
        target_amount,
        target_date,
        funding_account_id: funding_account_id || null,
        include_existing_balance: include_existing_balance || false,
        computed_monthly_contribution: computed_monthly_contribution || 0,
        current_amount: 0,
        is_completed: false,
      })
      .select()
      .single();
    if (error) return res.status(500).json({ error: 'Database error' });
    res.status(201).json({ goal: data, projection: computeProjection(data) });
  } catch (err) {
    console.error('[GOALS] POST error:', err.message);
    next({ status: 500, message: 'Failed to create goal' });
  }
});

// GET /v1/goals
router.get('/', async (req, res, next) => {
  try {
    const { data, error } = await supabaseForUser(req.accessToken)
      .from('goals')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: 'Database error' });
    const goals = data.map(goal => ({ ...goal, projection: computeProjection(goal) }));
    res.json({ goals });
  } catch (err) {
    next({ status: 500, message: 'Failed to fetch goals' });
  }
});

// GET /v1/goals/:id/projection
router.get('/:id/projection', async (req, res, next) => {
  try {
    const { data, error } = await supabaseForUser(req.accessToken)
      .from('goals')
      .select('*')
      .eq('id', req.params.id)
      .single();
    if (error?.code === 'PGRST116') return res.status(404).json({ error: 'Goal not found' });
    if (error) return res.status(500).json({ error: 'Database error' });
    res.json(computeProjection(data));
  } catch (err) {
    next({ status: 500, message: 'Failed to compute projection' });
  }
});

// PATCH /v1/goals/:id
router.patch('/:id', async (req, res, next) => {
  try {
    const allowed = ['name', 'type', 'target_amount', 'target_date', 'funding_account_id',
      'include_existing_balance', 'computed_monthly_contribution', 'current_amount'];
    const updates = { updated_at: new Date().toISOString() };
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    // Mark completed if current_amount reaches target
    if (updates.current_amount !== undefined) {
      const { data: existing } = await supabaseForUser(req.accessToken)
        .from('goals').select('target_amount').eq('id', req.params.id).single();
      if (existing && Number(updates.current_amount) >= Number(existing.target_amount)) {
        updates.is_completed = true;
      }
    }

    const { data, error } = await supabaseForUser(req.accessToken)
      .from('goals')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error?.code === 'PGRST116') return res.status(404).json({ error: 'Goal not found' });
    if (error) return res.status(500).json({ error: 'Database error' });
    res.json({ goal: data, projection: computeProjection(data) });
  } catch (err) {
    next({ status: 500, message: 'Failed to update goal' });
  }
});

// DELETE /v1/goals/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const { error } = await supabaseForUser(req.accessToken)
      .from('goals')
      .delete()
      .eq('id', req.params.id);
    if (error) return res.status(500).json({ error: 'Database error' });
    res.json({ success: true });
  } catch (err) {
    next({ status: 500, message: 'Failed to delete goal' });
  }
});

module.exports = router;
