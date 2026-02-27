'use strict';
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { verifyFirebaseToken } = require('../../middleware/auth');
const { supabaseForUser } = require('../../db');

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
    const { data, error } = await supabaseForUser(req.accessToken)
      .from('rules')
      .insert({
        id: uuidv4(),
        user_id: req.uid,
        priority: priority || 100,
        match_type,
        match_value,
        action_category_id,
        action_tags: action_tags || [],
        apply_scope: apply_scope || 'new_only',
        enabled: enabled !== false,
        last_applied_at: null,
      })
      .select()
      .single();
    if (error) return res.status(500).json({ error: 'Database error' });
    res.status(201).json({ rule: data });
  } catch (err) {
    console.error('[RULES] POST error:', err.message);
    next({ status: 500, message: 'Failed to create rule' });
  }
});

// GET /v1/rules
router.get('/', async (req, res, next) => {
  try {
    const { data, error } = await supabaseForUser(req.accessToken)
      .from('rules')
      .select('*')
      .order('priority');
    if (error) return res.status(500).json({ error: 'Database error' });
    res.json({ rules: data });
  } catch (err) {
    next({ status: 500, message: 'Failed to fetch rules' });
  }
});

// PATCH /v1/rules/:id
router.patch('/:id', async (req, res, next) => {
  try {
    const allowed = ['priority', 'match_type', 'match_value', 'action_category_id', 'action_tags', 'apply_scope', 'enabled'];
    const updates = { updated_at: new Date().toISOString() };
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    const { data, error } = await supabaseForUser(req.accessToken)
      .from('rules')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error?.code === 'PGRST116') return res.status(404).json({ error: 'Rule not found' });
    if (error) return res.status(500).json({ error: 'Database error' });
    res.json({ rule: data });
  } catch (err) {
    next({ status: 500, message: 'Failed to update rule' });
  }
});

// POST /v1/rules/:id/apply — retroactively apply a rule to existing transactions
router.post('/:id/apply', async (req, res, next) => {
  try {
    const { data: rule, error: ruleErr } = await supabaseForUser(req.accessToken)
      .from('rules')
      .select('*')
      .eq('id', req.params.id)
      .single();
    if (ruleErr?.code === 'PGRST116') return res.status(404).json({ error: 'Rule not found' });
    if (ruleErr) return res.status(500).json({ error: 'Database error' });

    const { data: txns, error: txnErr } = await supabaseForUser(req.accessToken)
      .from('transactions')
      .select('id, name, raw_description, account_id');
    if (txnErr) return res.status(500).json({ error: 'Database error' });

    const matchedIds = [];
    for (const txn of (txns || [])) {
      const name = (txn.name || txn.raw_description || '').toLowerCase();
      let matched = false;

      if (rule.match_type === 'merchant') {
        matched = name.includes(rule.match_value.toLowerCase());
      } else if (rule.match_type === 'regex') {
        try { matched = new RegExp(rule.match_value, 'i').test(name); } catch { /* skip */ }
      } else if (rule.match_type === 'account') {
        matched = txn.account_id === rule.match_value;
      }

      if (matched) matchedIds.push(txn.id);
    }

    if (matchedIds.length > 0) {
      const { error: updateErr } = await supabaseForUser(req.accessToken)
        .from('transactions')
        .update({
          category_id: rule.action_category_id,
          category: rule.action_category_id,
          updated_at: new Date().toISOString(),
        })
        .in('id', matchedIds);
      if (updateErr) return res.status(500).json({ error: 'Database error' });
    }

    await supabaseForUser(req.accessToken)
      .from('rules')
      .update({ last_applied_at: new Date().toISOString() })
      .eq('id', req.params.id);

    res.json({ applied_to: matchedIds.length });
  } catch (err) {
    console.error('[RULES] apply error:', err.message);
    next({ status: 500, message: 'Failed to apply rule' });
  }
});

module.exports = router;
