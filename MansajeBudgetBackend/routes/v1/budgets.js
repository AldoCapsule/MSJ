const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');
const { verifyFirebaseToken } = require('../../middleware/auth');

const db = () => admin.firestore();

router.use(verifyFirebaseToken);

// POST /v1/budgets
router.post('/', async (req, res, next) => {
  const { period_start, period_end, currency, lines } = req.body;
  if (!period_start || !period_end) {
    return res.status(400).json({ error: 'period_start and period_end are required' });
  }
  try {
    const ref = db().collection('users').doc(req.uid).collection('budgets').doc();
    const budget = {
      id: ref.id,
      user_id: req.uid,
      period_start: new Date(period_start),
      period_end: new Date(period_end),
      currency: currency || 'USD',
      status: 'on_track',
      created_at: admin.firestore.FieldValue.serverTimestamp(),
    };
    await ref.set(budget);

    // Create budget lines if provided
    const savedLines = [];
    if (Array.isArray(lines)) {
      const batch = db().batch();
      for (const line of lines) {
        const lineRef = ref.collection('lines').doc();
        const lineData = {
          id: lineRef.id,
          budget_id: ref.id,
          category_id: line.category_id,
          amount_planned: line.amount_planned || 0,
          amount_actual_cached: 0,
          rollover_enabled: line.rollover_enabled || false,
          rollover_mode: line.rollover_mode || 'reset_each_month',
          rollover_balance: 0,
        };
        batch.set(lineRef, lineData);
        savedLines.push(lineData);
      }
      await batch.commit();
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
    let query = db().collection('users').doc(req.uid).collection('budgets');

    if (month) {
      const [year, mon] = month.split('-').map(Number);
      const start = new Date(year, mon - 1, 1);
      const end = new Date(year, mon, 1);
      query = query.where('period_start', '>=', start).where('period_start', '<', end);
    } else {
      query = query.orderBy('period_start', 'desc').limit(12);
    }

    const snap = await query.get();
    const budgets = await Promise.all(snap.docs.map(async d => {
      const budget = { id: d.id, ...d.data() };
      const linesSnap = await d.ref.collection('lines').get();
      budget.lines = linesSnap.docs.map(l => ({ id: l.id, ...l.data() }));
      return budget;
    }));

    res.json({ budgets });
  } catch (err) {
    console.error('[BUDGETS] GET error:', err.message);
    next({ status: 500, message: 'Failed to fetch budgets' });
  }
});

// PUT /v1/budgets/:id
router.put('/:id', async (req, res, next) => {
  try {
    const ref = db().collection('users').doc(req.uid).collection('budgets').doc(req.params.id);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: 'Budget not found' });

    const updates = {};
    const allowed = ['period_start', 'period_end', 'currency', 'status'];
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    updates.updated_at = admin.firestore.FieldValue.serverTimestamp();
    await ref.update(updates);
    res.json({ budget: { id: snap.id, ...snap.data(), ...updates } });
  } catch (err) {
    next({ status: 500, message: 'Failed to update budget' });
  }
});

// POST /v1/budget-lines/:id/rollover/enable
router.post('/lines/:lineId/rollover/enable', async (req, res, next) => {
  const { rollover_mode, budget_id } = req.body;
  try {
    // Find the budget line across all budgets
    const budgetsSnap = await db().collection('users').doc(req.uid).collection('budgets').get();
    let lineRef = null;
    for (const budgetDoc of budgetsSnap.docs) {
      const lineSnap = await budgetDoc.ref.collection('lines').doc(req.params.lineId).get();
      if (lineSnap.exists) { lineRef = lineSnap.ref; break; }
    }
    if (!lineRef) return res.status(404).json({ error: 'Budget line not found' });

    await lineRef.update({
      rollover_enabled: true,
      rollover_mode: rollover_mode || 'carry_forward',
    });
    res.json({ success: true, rollover_mode: rollover_mode || 'carry_forward' });
  } catch (err) {
    next({ status: 500, message: 'Failed to enable rollover' });
  }
});

// GET /v1/budgets/:id/rollovers
router.get('/:id/rollovers', async (req, res, next) => {
  try {
    const ref = db().collection('users').doc(req.uid).collection('budgets').doc(req.params.id);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: 'Budget not found' });
    const rolloversSnap = await ref.collection('rollover_events').orderBy('from_month', 'desc').get();
    res.json({ rollovers: rolloversSnap.docs.map(d => ({ id: d.id, ...d.data() })) });
  } catch (err) {
    next({ status: 500, message: 'Failed to fetch rollovers' });
  }
});

module.exports = router;
