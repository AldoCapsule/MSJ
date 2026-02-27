'use strict';
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { verifyFirebaseToken } = require('../../middleware/auth');
const { supabaseForUser } = require('../../db');

router.use(verifyFirebaseToken);

// GET /v1/transactions?from=&to=&account_id=&category_id=&search=&limit=&page=
router.get('/', async (req, res, next) => {
  try {
    const { from, to, account_id, category_id, search } = req.query;
    const page = parseInt(req.query.page) || 0;
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);

    let query = supabaseForUser(req.accessToken)
      .from('transactions')
      .select('*')
      .order('date', { ascending: false })
      .range(page * limit, (page + 1) * limit - 1);

    if (from) query = query.gte('date', from);
    if (to) query = query.lte('date', to);
    if (account_id) query = query.eq('account_id', account_id);
    if (category_id) query = query.eq('category_id', category_id);
    if (search) query = query.ilike('name', `%${search}%`);

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: 'Database error' });
    res.json({ transactions: data, count: data.length });
  } catch (err) {
    console.error('[TRANSACTIONS] GET error:', err.message);
    next({ status: 500, message: 'Failed to fetch transactions' });
  }
});

// GET /v1/transactions/:id
router.get('/:id', async (req, res, next) => {
  try {
    const { data, error } = await supabaseForUser(req.accessToken)
      .from('transactions')
      .select('*')
      .eq('id', req.params.id)
      .single();
    if (error?.code === 'PGRST116') return res.status(404).json({ error: 'Transaction not found' });
    if (error) return res.status(500).json({ error: 'Database error' });
    res.json({ transaction: data });
  } catch (err) {
    next({ status: 500, message: 'Failed to fetch transaction' });
  }
});

// GET /v1/transactions/:id/provenance
router.get('/:id/provenance', async (req, res, next) => {
  try {
    const { data, error } = await supabaseForUser(req.accessToken)
      .from('transactions')
      .select('*')
      .eq('id', req.params.id)
      .single();
    if (error?.code === 'PGRST116') return res.status(404).json({ error: 'Transaction not found' });
    if (error) return res.status(500).json({ error: 'Database error' });
    res.json({
      transaction_id: data.id,
      source_system: data.is_manual ? 'manual' : 'plaid',
      plaid_transaction_id: data.id,
      account_id: data.account_id,
      fetched_at: data.last_synced_at || data.date,
      raw_description: data.raw_description || data.name,
      normalized_fingerprint: data.normalized_fingerprint || null,
      lineage_group_id: data.lineage_group_id || null,
    });
  } catch (err) {
    next({ status: 500, message: 'Failed to fetch provenance' });
  }
});

// POST /v1/transactions (manual)
router.post('/', async (req, res, next) => {
  try {
    const { data, error } = await supabaseForUser(req.accessToken)
      .from('transactions')
      .insert({
        id: uuidv4(),
        ...req.body,
        user_id: req.uid,
        is_manual: true,
        is_hidden: false,
        is_transfer: false,
        review_status: 'unreviewed',
      })
      .select()
      .single();
    if (error) return res.status(500).json({ error: 'Database error' });
    res.status(201).json({ transaction: data });
  } catch (err) {
    next({ status: 500, message: 'Failed to create transaction' });
  }
});

// PATCH /v1/transactions/:id
router.patch('/:id', async (req, res, next) => {
  try {
    const allowed = ['name', 'category', 'category_id', 'notes', 'is_hidden', 'review_status',
      'reviewed_at', 'is_transfer'];
    const updates = { updated_at: new Date().toISOString() };
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    if (req.body.review_status === 'reviewed' && !req.body.reviewed_at) {
      updates.reviewed_at = new Date().toISOString();
    }

    const { data, error } = await supabaseForUser(req.accessToken)
      .from('transactions')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error?.code === 'PGRST116') return res.status(404).json({ error: 'Transaction not found' });
    if (error) return res.status(500).json({ error: 'Database error' });
    res.json({ transaction: data });
  } catch (err) {
    next({ status: 500, message: 'Failed to update transaction' });
  }
});

// POST /v1/transactions/:id/splits
router.post('/:id/splits', async (req, res, next) => {
  const { splits } = req.body;
  if (!Array.isArray(splits) || splits.length < 2) {
    return res.status(400).json({ error: 'splits must be an array with at least 2 entries' });
  }
  try {
    const { data: txn, error: txnErr } = await supabaseForUser(req.accessToken)
      .from('transactions')
      .select('amount')
      .eq('id', req.params.id)
      .single();
    if (txnErr?.code === 'PGRST116') return res.status(404).json({ error: 'Transaction not found' });
    if (txnErr) return res.status(500).json({ error: 'Database error' });

    const totalSplit = splits.reduce((s, x) => s + x.amount, 0);
    if (Math.abs(totalSplit - Math.abs(txn.amount)) > 0.01) {
      return res.status(400).json({ error: 'Split amounts must sum to the transaction amount' });
    }

    // Delete old splits then insert new ones
    await supabaseForUser(req.accessToken)
      .from('transaction_splits')
      .delete()
      .eq('txn_id', req.params.id);

    const newSplits = splits.map(s => ({
      id: uuidv4(),
      txn_id: req.params.id,
      user_id: req.uid,
      ...s,
    }));
    const { data: savedSplits, error: splitErr } = await supabaseForUser(req.accessToken)
      .from('transaction_splits')
      .insert(newSplits)
      .select();
    if (splitErr) return res.status(500).json({ error: 'Database error' });

    await supabaseForUser(req.accessToken)
      .from('transactions')
      .update({ is_split: true, updated_at: new Date().toISOString() })
      .eq('id', req.params.id);

    res.status(201).json({ splits: savedSplits });
  } catch (err) {
    console.error('[TRANSACTIONS] splits error:', err.message);
    next({ status: 500, message: 'Failed to create splits' });
  }
});

// POST /v1/transactions/:id/review
router.post('/:id/review', async (req, res, next) => {
  try {
    const { error } = await supabaseForUser(req.accessToken)
      .from('transactions')
      .update({ review_status: 'reviewed', reviewed_at: new Date().toISOString() })
      .eq('id', req.params.id);
    if (error) return res.status(500).json({ error: 'Database error' });
    res.json({ success: true });
  } catch (err) {
    next({ status: 500, message: 'Failed to mark as reviewed' });
  }
});

// POST /v1/transactions/:id/categorize/recompute
router.post('/:id/categorize/recompute', async (req, res, next) => {
  try {
    const { data: txn, error: txnErr } = await supabaseForUser(req.accessToken)
      .from('transactions')
      .select('*')
      .eq('id', req.params.id)
      .single();
    if (txnErr?.code === 'PGRST116') return res.status(404).json({ error: 'Transaction not found' });
    if (txnErr) return res.status(500).json({ error: 'Database error' });

    const { data: rules } = await supabaseForUser(req.accessToken)
      .from('rules')
      .select('*')
      .eq('enabled', true)
      .order('priority');

    let matchedCategory = null;
    for (const rule of (rules || [])) {
      const name = (txn.name || txn.raw_description || '').toLowerCase();
      let matched = false;
      if (rule.match_type === 'merchant') {
        matched = name.includes(rule.match_value.toLowerCase());
      } else if (rule.match_type === 'regex') {
        try { matched = new RegExp(rule.match_value, 'i').test(name); } catch { /* ignore bad regex */ }
      } else if (rule.match_type === 'account') {
        matched = txn.account_id === rule.match_value;
      }
      if (matched && rule.action_category_id) {
        matchedCategory = rule.action_category_id;
        break;
      }
    }

    if (matchedCategory) {
      await supabaseForUser(req.accessToken)
        .from('transactions')
        .update({ category_id: matchedCategory, category: matchedCategory,
          updated_at: new Date().toISOString() })
        .eq('id', req.params.id);
    }

    res.json({ category_id: matchedCategory, rule_matched: !!matchedCategory });
  } catch (err) {
    console.error('[TRANSACTIONS] recompute error:', err.message);
    next({ status: 500, message: 'Failed to recompute category' });
  }
});

// POST /v1/transactions/bulk-edit
router.post('/bulk-edit', async (req, res, next) => {
  const { txn_ids, operations } = req.body;
  if (!Array.isArray(txn_ids) || txn_ids.length === 0) {
    return res.status(400).json({ error: 'txn_ids array is required' });
  }
  if (!operations || typeof operations !== 'object') {
    return res.status(400).json({ error: 'operations object is required' });
  }
  try {
    const updates = { updated_at: new Date().toISOString() };
    if (operations.category) { updates.category = operations.category; updates.category_id = operations.category; }
    if (operations.merchant_name) updates.name = operations.merchant_name;
    if (operations.is_hidden !== undefined) updates.is_hidden = operations.is_hidden;

    const { error } = await supabaseForUser(req.accessToken)
      .from('transactions')
      .update(updates)
      .in('id', txn_ids.slice(0, 500));
    if (error) return res.status(500).json({ error: 'Database error' });

    res.json({ status: 'completed', updated_count: txn_ids.length });
  } catch (err) {
    console.error('[TRANSACTIONS] bulk-edit error:', err.message);
    next({ status: 500, message: 'Failed to bulk edit transactions' });
  }
});

// POST /v1/transfers/recompute — detect transfers between linked accounts
router.post('/transfers/recompute', async (req, res, next) => {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const { data: txns, error } = await supabaseForUser(req.accessToken)
      .from('transactions')
      .select('*')
      .gte('date', thirtyDaysAgo);
    if (error) return res.status(500).json({ error: 'Database error' });

    const sorted = txns.sort((a, b) => new Date(a.date) - new Date(b.date));
    const matches = [];
    const matched = new Set();

    for (let i = 0; i < sorted.length; i++) {
      if (matched.has(sorted[i].id)) continue;
      for (let j = i + 1; j < sorted.length; j++) {
        if (matched.has(sorted[j].id)) continue;
        const a = sorted[i], b = sorted[j];
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

    for (const match of matches) {
      await supabaseForUser(req.accessToken)
        .from('transactions')
        .update({ is_transfer: true, transfer_match_id: match.to_id })
        .eq('id', match.from_id);
      await supabaseForUser(req.accessToken)
        .from('transactions')
        .update({ is_transfer: true, transfer_match_id: match.from_id })
        .eq('id', match.to_id);
    }

    res.json({ matches_found: matches.length, matches });
  } catch (err) {
    console.error('[TRANSACTIONS] transfers error:', err.message);
    next({ status: 500, message: 'Failed to recompute transfers' });
  }
});

// GET /v1/merchants
router.get('/merchants', async (req, res, next) => {
  try {
    const { data, error } = await supabaseForUser(req.accessToken)
      .from('merchants')
      .select('*')
      .order('canonical_name');
    if (error) return res.status(500).json({ error: 'Database error' });
    res.json({ merchants: data });
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
    const { data, error } = await supabaseForUser(req.accessToken)
      .from('merchant_aliases')
      .insert({
        id: uuidv4(),
        user_id: req.uid,
        raw_name,
        canonical_name,
        merchant_id: merchant_id || null,
      })
      .select()
      .single();
    if (error) return res.status(500).json({ error: 'Database error' });
    res.status(201).json({ alias: data });
  } catch (err) {
    next({ status: 500, message: 'Failed to create merchant alias' });
  }
});

module.exports = router;
