const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');
const { verifyFirebaseToken } = require('../../middleware/auth');

const db = () => admin.firestore();

router.use(verifyFirebaseToken);

// POST /v1/alerts/rules
router.post('/rules', async (req, res, next) => {
  const { type, params, channel, enabled } = req.body;
  const validTypes = ['budget_threshold', 'low_balance', 'large_txn', 'price_change'];
  if (!type || !validTypes.includes(type)) {
    return res.status(400).json({ error: `type must be one of: ${validTypes.join(', ')}` });
  }
  try {
    const ref = db().collection('users').doc(req.uid).collection('alert_rules').doc();
    const rule = {
      id: ref.id,
      user_id: req.uid,
      type,
      params: params || {},
      channel: channel || 'push',
      enabled: enabled !== false,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
    };
    await ref.set(rule);
    res.status(201).json({ rule });
  } catch (err) {
    console.error('[ALERTS] POST rules error:', err.message);
    next({ status: 500, message: 'Failed to create alert rule' });
  }
});

// GET /v1/alerts/rules
router.get('/rules', async (req, res, next) => {
  try {
    const snap = await db().collection('users').doc(req.uid).collection('alert_rules')
      .orderBy('created_at', 'desc').get();
    res.json({ rules: snap.docs.map(d => ({ id: d.id, ...d.data() })) });
  } catch (err) {
    next({ status: 500, message: 'Failed to fetch alert rules' });
  }
});

// PATCH /v1/alerts/rules/:id
router.patch('/rules/:id', async (req, res, next) => {
  try {
    const ref = db().collection('users').doc(req.uid).collection('alert_rules').doc(req.params.id);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: 'Alert rule not found' });

    const updates = { updated_at: admin.firestore.FieldValue.serverTimestamp() };
    ['type', 'params', 'channel', 'enabled'].forEach(k => {
      if (req.body[k] !== undefined) updates[k] = req.body[k];
    });
    await ref.update(updates);
    res.json({ rule: { id: snap.id, ...snap.data(), ...updates } });
  } catch (err) {
    next({ status: 500, message: 'Failed to update alert rule' });
  }
});

// GET /v1/alerts/events
router.get('/events', async (req, res, next) => {
  try {
    const { unacknowledged_only } = req.query;
    let query = db().collection('users').doc(req.uid).collection('alert_events')
      .orderBy('fired_at', 'desc').limit(100);
    if (unacknowledged_only === 'true') {
      query = query.where('acknowledged_at', '==', null);
    }
    const snap = await query.get();
    res.json({ events: snap.docs.map(d => ({ id: d.id, ...d.data() })) });
  } catch (err) {
    next({ status: 500, message: 'Failed to fetch alert events' });
  }
});

// POST /v1/alerts/events/:id/acknowledge
router.post('/events/:id/acknowledge', async (req, res, next) => {
  try {
    const ref = db().collection('users').doc(req.uid).collection('alert_events').doc(req.params.id);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: 'Alert event not found' });
    await ref.update({ acknowledged_at: admin.firestore.FieldValue.serverTimestamp() });
    res.json({ success: true });
  } catch (err) {
    next({ status: 500, message: 'Failed to acknowledge alert' });
  }
});

// Internal helper — evaluate and fire budget threshold alerts
// Called by webhook/transaction-sync handlers when budgets update
async function evaluateBudgetAlerts(uid) {
  try {
    const rulesSnap = await db().collection('users').doc(uid).collection('alert_rules')
      .where('type', '==', 'budget_threshold').where('enabled', '==', true).get();
    if (rulesSnap.empty) return;

    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();

    const budgetsSnap = await db().collection('users').doc(uid).collection('budgets')
      .where('month', '==', month).where('year', '==', year).get();

    for (const ruleDoc of rulesSnap.docs) {
      const rule = ruleDoc.data();
      const thresholdPct = rule.params?.threshold_pct || 80;
      const categoryId = rule.params?.category_id;

      for (const budgetDoc of budgetsSnap.docs) {
        const budget = budgetDoc.data();
        if (categoryId && budget.category !== categoryId && budget.categoryId !== categoryId) continue;
        const progress = budget.limit > 0 ? (budget.spent / budget.limit) * 100 : 0;
        if (progress >= thresholdPct) {
          const eventRef = db().collection('users').doc(uid).collection('alert_events').doc();
          await eventRef.set({
            id: eventRef.id,
            alert_rule_id: ruleDoc.id,
            fired_at: admin.firestore.FieldValue.serverTimestamp(),
            payload: { category: budget.category, spent: budget.spent, limit: budget.limit, progress_pct: progress },
            acknowledged_at: null,
          });
        }
      }
    }
  } catch (err) {
    console.error('[ALERTS] evaluate error:', err.message);
  }
}

module.exports = router;
module.exports.evaluateBudgetAlerts = evaluateBudgetAlerts;
