const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');
const { verifyFirebaseToken } = require('../../middleware/auth');

const db = () => admin.firestore();

router.use(verifyFirebaseToken);

// POST /v1/rules
router.post('/', async (req, res, next) => {
  const { priority, match_type, match_value, action_category_id, action_tags, apply_scope, enabled } = req.body;
  const validMatchTypes = ['merchant', 'regex', 'mcc', 'account'];
  if (!match_type || !match_value || !action_category_id) {
    return res.status(400).json({ error: 'match_type, match_value, and action_category_id are required' });
  }
  if (!validMatchTypes.includes(match_type)) {
    return res.status(400).json({ error: `match_type must be one of: ${validMatchTypes.join(', ')}` });
  }
  // Validate regex
  if (match_type === 'regex') {
    try { new RegExp(match_value); } catch {
      return res.status(400).json({ error: 'match_value is not a valid regex pattern' });
    }
  }
  try {
    const ref = db().collection('users').doc(req.uid).collection('rules').doc();
    const rule = {
      id: ref.id,
      user_id: req.uid,
      priority: priority || 100,
      match_type,
      match_value,
      action_category_id,
      action_tags: action_tags || [],
      apply_scope: apply_scope || 'new_only',
      enabled: enabled !== false,
      last_applied_at: null,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
    };
    await ref.set(rule);
    res.status(201).json({ rule });
  } catch (err) {
    console.error('[RULES] POST error:', err.message);
    next({ status: 500, message: 'Failed to create rule' });
  }
});

// GET /v1/rules
router.get('/', async (req, res, next) => {
  try {
    const snap = await db().collection('users').doc(req.uid).collection('rules')
      .orderBy('priority').get();
    res.json({ rules: snap.docs.map(d => ({ id: d.id, ...d.data() })) });
  } catch (err) {
    next({ status: 500, message: 'Failed to fetch rules' });
  }
});

// PATCH /v1/rules/:id
router.patch('/:id', async (req, res, next) => {
  try {
    const ref = db().collection('users').doc(req.uid).collection('rules').doc(req.params.id);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: 'Rule not found' });

    const allowed = ['priority', 'match_type', 'match_value', 'action_category_id', 'action_tags', 'apply_scope', 'enabled'];
    const updates = { updated_at: admin.firestore.FieldValue.serverTimestamp() };
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    await ref.update(updates);
    res.json({ rule: { id: snap.id, ...snap.data(), ...updates } });
  } catch (err) {
    next({ status: 500, message: 'Failed to update rule' });
  }
});

// POST /v1/rules/:id/apply — retroactively apply a rule to existing transactions
router.post('/:id/apply', async (req, res, next) => {
  try {
    const ruleSnap = await db().collection('users').doc(req.uid).collection('rules').doc(req.params.id).get();
    if (!ruleSnap.exists) return res.status(404).json({ error: 'Rule not found' });
    const rule = ruleSnap.data();

    const txnsSnap = await db().collection('users').doc(req.uid).collection('transactions').get();
    const txns = txnsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    const batch = db().batch();
    let matchCount = 0;

    for (const txn of txns) {
      const name = (txn.name || txn.rawDescription || '').toLowerCase();
      let matched = false;

      if (rule.match_type === 'merchant') {
        matched = name.includes(rule.match_value.toLowerCase());
      } else if (rule.match_type === 'regex') {
        try { matched = new RegExp(rule.match_value, 'i').test(name); } catch { /* skip */ }
      } else if (rule.match_type === 'account') {
        matched = txn.accountId === rule.match_value;
      }

      if (matched) {
        const txnRef = db().collection('users').doc(req.uid).collection('transactions').doc(txn.id);
        batch.update(txnRef, { categoryId: rule.action_category_id, category: rule.action_category_id,
          updated_at: admin.firestore.FieldValue.serverTimestamp() });
        matchCount++;
      }
    }

    if (matchCount > 0) await batch.commit();
    await ruleSnap.ref.update({ last_applied_at: admin.firestore.FieldValue.serverTimestamp() });

    res.json({ applied_to: matchCount });
  } catch (err) {
    console.error('[RULES] apply error:', err.message);
    next({ status: 500, message: 'Failed to apply rule' });
  }
});

module.exports = router;
