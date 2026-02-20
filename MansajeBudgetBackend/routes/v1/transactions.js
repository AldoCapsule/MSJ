const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');
const { v4: uuidv4 } = require('uuid');
const { verifyFirebaseToken } = require('../../middleware/auth');

const db = () => admin.firestore();

router.use(verifyFirebaseToken);

// GET /v1/transactions?from=&to=&account_id=&category_id=&search=&limit=&cursor=
router.get('/', async (req, res, next) => {
  try {
    const { from, to, account_id, category_id, search, limit = 50 } = req.query;
    let query = db().collection('users').doc(req.uid)
      .collection('transactions')
      .orderBy('date', 'desc');

    if (from) query = query.where('date', '>=', new Date(from));
    if (to) query = query.where('date', '<=', new Date(to));
    if (account_id) query = query.where('accountId', '==', account_id);

    query = query.limit(parseInt(limit));

    const snap = await query.get();
    let transactions = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    // Client-side filters for fields that can't be combined with range queries
    if (category_id) {
      transactions = transactions.filter(t => t.categoryId === category_id || t.category === category_id);
    }
    if (search) {
      const q = search.toLowerCase();
      transactions = transactions.filter(t =>
        (t.name || '').toLowerCase().includes(q) ||
        (t.notes || '').toLowerCase().includes(q)
      );
    }

    res.json({ transactions, count: transactions.length });
  } catch (err) {
    console.error('[TRANSACTIONS] GET error:', err.message);
    next({ status: 500, message: 'Failed to fetch transactions' });
  }
});

// GET /v1/transactions/:id
router.get('/:id', async (req, res, next) => {
  try {
    const snap = await db().collection('users').doc(req.uid)
      .collection('transactions').doc(req.params.id).get();
    if (!snap.exists) return res.status(404).json({ error: 'Transaction not found' });
    res.json({ transaction: { id: snap.id, ...snap.data() } });
  } catch (err) {
    next({ status: 500, message: 'Failed to fetch transaction' });
  }
});

// GET /v1/transactions/:id/provenance
router.get('/:id/provenance', async (req, res, next) => {
  try {
    const snap = await db().collection('users').doc(req.uid)
      .collection('transactions').doc(req.params.id).get();
    if (!snap.exists) return res.status(404).json({ error: 'Transaction not found' });
    const txn = snap.data();
    res.json({
      transaction_id: snap.id,
      source_system: txn.isManual ? 'manual' : 'plaid',
      plaid_transaction_id: txn.plaidTransactionId || null,
      account_id: txn.accountId,
      fetched_at: txn.lastSyncedAt || txn.date,
      raw_description: txn.rawDescription || txn.name,
      normalized_fingerprint: txn.normalizedFingerprint || null,
      lineage_group_id: txn.lineageGroupId || null,
    });
  } catch (err) {
    next({ status: 500, message: 'Failed to fetch provenance' });
  }
});

// PATCH /v1/transactions/:id
router.patch('/:id', async (req, res, next) => {
  try {
    const ref = db().collection('users').doc(req.uid)
      .collection('transactions').doc(req.params.id);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: 'Transaction not found' });

    const allowed = ['name', 'category', 'categoryId', 'notes', 'isHidden', 'reviewStatus', 'reviewedAt', 'isTransfer'];
    const updates = { updated_at: admin.firestore.FieldValue.serverTimestamp() };
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    if (req.body.reviewStatus === 'reviewed' && !req.body.reviewedAt) {
      updates.reviewedAt = admin.firestore.FieldValue.serverTimestamp();
    }
    await ref.update(updates);
    res.json({ transaction: { id: snap.id, ...snap.data(), ...updates } });
  } catch (err) {
    next({ status: 500, message: 'Failed to update transaction' });
  }
});

// POST /v1/transactions/:id/splits
router.post('/:id/splits', async (req, res, next) => {
  const { splits } = req.body; // [{category_id, amount, memo}]
  if (!Array.isArray(splits) || splits.length < 2) {
    return res.status(400).json({ error: 'splits must be an array with at least 2 entries' });
  }
  try {
    const ref = db().collection('users').doc(req.uid)
      .collection('transactions').doc(req.params.id);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: 'Transaction not found' });

    const txn = snap.data();
    const totalSplit = splits.reduce((s, x) => s + x.amount, 0);
    if (Math.abs(totalSplit - Math.abs(txn.amount)) > 0.01) {
      return res.status(400).json({ error: 'Split amounts must sum to the transaction amount' });
    }

    const batch = db().batch();
    const splitsCol = ref.collection('splits');

    // Delete old splits
    const oldSplits = await splitsCol.get();
    oldSplits.docs.forEach(d => batch.delete(d.ref));

    // Add new splits
    const savedSplits = splits.map(s => {
      const splitRef = splitsCol.doc();
      const split = { id: splitRef.id, txn_id: req.params.id, ...s,
        created_at: admin.firestore.FieldValue.serverTimestamp() };
      batch.set(splitRef, split);
      return split;
    });

    // Mark transaction as split
    batch.update(ref, { isSplit: true, splitGroupId: req.params.id,
      updated_at: admin.firestore.FieldValue.serverTimestamp() });

    await batch.commit();
    res.status(201).json({ splits: savedSplits });
  } catch (err) {
    console.error('[TRANSACTIONS] splits error:', err.message);
    next({ status: 500, message: 'Failed to create splits' });
  }
});

// POST /v1/transactions/:id/review
router.post('/:id/review', async (req, res, next) => {
  try {
    const ref = db().collection('users').doc(req.uid)
      .collection('transactions').doc(req.params.id);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: 'Transaction not found' });
    await ref.update({
      reviewStatus: 'reviewed',
      reviewedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    res.json({ success: true });
  } catch (err) {
    next({ status: 500, message: 'Failed to mark as reviewed' });
  }
});

// POST /v1/transactions/:id/categorize/recompute
router.post('/:id/categorize/recompute', async (req, res, next) => {
  try {
    const ref = db().collection('users').doc(req.uid)
      .collection('transactions').doc(req.params.id);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: 'Transaction not found' });
    const txn = snap.data();

    // Apply user rules first
    const rulesSnap = await db().collection('users').doc(req.uid)
      .collection('rules').where('enabled', '==', true).orderBy('priority').get();

    let matchedCategory = null;
    for (const ruleDoc of rulesSnap.docs) {
      const rule = ruleDoc.data();
      const name = (txn.name || txn.rawDescription || '').toLowerCase();
      let matched = false;
      if (rule.match_type === 'merchant') {
        matched = name.includes(rule.match_value.toLowerCase());
      } else if (rule.match_type === 'regex') {
        try { matched = new RegExp(rule.match_value, 'i').test(name); } catch { /* ignore bad regex */ }
      } else if (rule.match_type === 'account') {
        matched = txn.accountId === rule.match_value;
      }
      if (matched && rule.action_category_id) {
        matchedCategory = rule.action_category_id;
        break;
      }
    }

    if (matchedCategory) {
      await ref.update({ categoryId: matchedCategory, category: matchedCategory,
        updated_at: admin.firestore.FieldValue.serverTimestamp() });
    }

    res.json({ category_id: matchedCategory, rule_matched: !!matchedCategory });
  } catch (err) {
    console.error('[TRANSACTIONS] recompute error:', err.message);
    next({ status: 500, message: 'Failed to recompute category' });
  }
});

// POST /v1/transactions/bulk-edit
router.post('/bulk-edit', async (req, res, next) => {
  const { txn_ids, operations } = req.body; // operations: {category?, tags?, merchant_name?}
  if (!Array.isArray(txn_ids) || txn_ids.length === 0) {
    return res.status(400).json({ error: 'txn_ids array is required' });
  }
  if (!operations || typeof operations !== 'object') {
    return res.status(400).json({ error: 'operations object is required' });
  }
  try {
    const jobRef = db().collection('users').doc(req.uid).collection('bulk_edit_jobs').doc();
    await jobRef.set({
      id: jobRef.id,
      user_id: req.uid,
      txn_ids,
      operations,
      status: 'processing',
      created_at: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Process immediately (small enough to be sync; would be async queue in production)
    const batch = db().batch();
    const updates = { updated_at: admin.firestore.FieldValue.serverTimestamp() };
    if (operations.category) updates.category = operations.category;
    if (operations.category) updates.categoryId = operations.category;
    if (operations.merchant_name) updates.name = operations.merchant_name;
    if (operations.is_hidden !== undefined) updates.isHidden = operations.is_hidden;

    const txnsCol = db().collection('users').doc(req.uid).collection('transactions');
    for (const txnId of txn_ids.slice(0, 500)) {
      batch.update(txnsCol.doc(txnId), updates);
    }
    await batch.commit();

    await jobRef.update({ status: 'completed',
      completed_at: admin.firestore.FieldValue.serverTimestamp() });
    res.json({ job_id: jobRef.id, status: 'completed', updated_count: txn_ids.length });
  } catch (err) {
    console.error('[TRANSACTIONS] bulk-edit error:', err.message);
    next({ status: 500, message: 'Failed to bulk edit transactions' });
  }
});

// POST /v1/transfers/recompute — detect transfers between linked accounts
router.post('/transfers/recompute', async (req, res, next) => {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const snap = await db().collection('users').doc(req.uid)
      .collection('transactions')
      .where('date', '>=', thirtyDaysAgo)
      .get();

    const txns = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const matches = [];
    const matched = new Set();

    for (let i = 0; i < txns.length; i++) {
      if (matched.has(txns[i].id)) continue;
      for (let j = i + 1; j < txns.length; j++) {
        if (matched.has(txns[j].id)) continue;
        const a = txns[i], b = txns[j];
        // Mirror amounts (one debit, one credit), within 3 days, same amount
        if (
          Math.abs(Math.abs(a.amount) - Math.abs(b.amount)) < 0.01 &&
          Math.sign(a.amount) !== Math.sign(b.amount) &&
          Math.abs(new Date(a.date) - new Date(b.date)) < 3 * 24 * 60 * 60 * 1000
        ) {
          matches.push({ from_id: a.id, to_id: b.id, amount: Math.abs(a.amount), confidence: 0.9 });
          matched.add(a.id); matched.add(b.id);
        }
      }
    }

    const batch = db().batch();
    const txnsCol = db().collection('users').doc(req.uid).collection('transactions');
    for (const match of matches) {
      batch.update(txnsCol.doc(match.from_id), { isTransfer: true, transferMatchId: match.to_id });
      batch.update(txnsCol.doc(match.to_id), { isTransfer: true, transferMatchId: match.from_id });
    }
    if (matches.length > 0) await batch.commit();

    res.json({ matches_found: matches.length, matches });
  } catch (err) {
    console.error('[TRANSACTIONS] transfers error:', err.message);
    next({ status: 500, message: 'Failed to recompute transfers' });
  }
});

// GET /v1/merchants
router.get('/merchants', async (req, res, next) => {
  try {
    const snap = await db().collection('users').doc(req.uid)
      .collection('merchants').orderBy('canonical_name').get();
    res.json({ merchants: snap.docs.map(d => ({ id: d.id, ...d.data() })) });
  } catch (err) {
    next({ status: 500, message: 'Failed to fetch merchants' });
  }
});

// POST /v1/merchants/aliases
router.post('/merchants/aliases', async (req, res, next) => {
  const { raw_name, canonical_name, merchant_id } = req.body;
  if (!raw_name || !canonical_name) {
    return res.status(400).json({ error: 'raw_name and canonical_name are required' });
  }
  try {
    const ref = db().collection('users').doc(req.uid).collection('merchant_aliases').doc();
    await ref.set({ id: ref.id, raw_name, canonical_name, merchant_id: merchant_id || null,
      created_at: admin.firestore.FieldValue.serverTimestamp() });
    res.status(201).json({ alias: { id: ref.id, raw_name, canonical_name } });
  } catch (err) {
    next({ status: 500, message: 'Failed to create merchant alias' });
  }
});

module.exports = router;
