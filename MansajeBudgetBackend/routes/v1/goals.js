const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');
const { verifyFirebaseToken } = require('../../middleware/auth');

const db = () => admin.firestore();

router.use(verifyFirebaseToken);

function computeProjection(goal) {
  const now = new Date();
  const targetDate = goal.target_date instanceof Date ? goal.target_date : new Date(goal.target_date._seconds * 1000);
  const monthsRemaining = Math.max(
    (targetDate.getFullYear() - now.getFullYear()) * 12 + (targetDate.getMonth() - now.getMonth()),
    1
  );
  const currentBalance = goal.current_balance || 0;
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
    const ref = db().collection('users').doc(req.uid).collection('goals').doc();
    const goal = {
      id: ref.id,
      user_id: req.uid,
      name,
      type,
      target_amount,
      target_date: new Date(target_date),
      funding_account_id: funding_account_id || null,
      include_existing_balance: include_existing_balance || false,
      computed_monthly_contribution: computed_monthly_contribution || 0,
      current_balance: 0,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
    };
    await ref.set(goal);
    res.status(201).json({ goal, projection: computeProjection(goal) });
  } catch (err) {
    console.error('[GOALS] POST error:', err.message);
    next({ status: 500, message: 'Failed to create goal' });
  }
});

// GET /v1/goals
router.get('/', async (req, res, next) => {
  try {
    const snap = await db().collection('users').doc(req.uid).collection('goals')
      .orderBy('created_at', 'desc').get();
    const goals = snap.docs.map(d => {
      const goal = { id: d.id, ...d.data() };
      return { ...goal, projection: computeProjection(goal) };
    });
    res.json({ goals });
  } catch (err) {
    next({ status: 500, message: 'Failed to fetch goals' });
  }
});

// GET /v1/goals/:id/projection
router.get('/:id/projection', async (req, res, next) => {
  try {
    const snap = await db().collection('users').doc(req.uid).collection('goals').doc(req.params.id).get();
    if (!snap.exists) return res.status(404).json({ error: 'Goal not found' });
    res.json(computeProjection({ id: snap.id, ...snap.data() }));
  } catch (err) {
    next({ status: 500, message: 'Failed to compute projection' });
  }
});

// PATCH /v1/goals/:id
router.patch('/:id', async (req, res, next) => {
  try {
    const ref = db().collection('users').doc(req.uid).collection('goals').doc(req.params.id);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: 'Goal not found' });

    const allowed = ['name', 'type', 'target_amount', 'target_date', 'funding_account_id',
      'include_existing_balance', 'computed_monthly_contribution', 'current_balance'];
    const updates = { updated_at: admin.firestore.FieldValue.serverTimestamp() };
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    if (updates.target_date) updates.target_date = new Date(updates.target_date);
    await ref.update(updates);
    const updated = { id: snap.id, ...snap.data(), ...updates };
    res.json({ goal: updated, projection: computeProjection(updated) });
  } catch (err) {
    next({ status: 500, message: 'Failed to update goal' });
  }
});

// DELETE /v1/goals/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const ref = db().collection('users').doc(req.uid).collection('goals').doc(req.params.id);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: 'Goal not found' });
    await ref.delete();
    res.json({ success: true });
  } catch (err) {
    next({ status: 500, message: 'Failed to delete goal' });
  }
});

module.exports = router;
