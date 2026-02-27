'use strict';
const express = require('express');
const router = express.Router();
const { verifyFirebaseToken } = require('../../middleware/auth');
const { supabaseForUser } = require('../../db');

router.use(verifyFirebaseToken);

// GET /v1/accounts
router.get('/', async (req, res, next) => {
  try {
    const { data, error } = await supabaseForUser(req.accessToken)
      .from('accounts')
      .select('*')
      .order('name');
    if (error) return res.status(500).json({ error: 'Database error' });
    res.json({ accounts: data });
  } catch (err) {
    next({ status: 500, message: 'Failed to fetch accounts' });
  }
});

// GET /v1/accounts/:id
router.get('/:id', async (req, res, next) => {
  try {
    const { data, error } = await supabaseForUser(req.accessToken)
      .from('accounts')
      .select('*')
      .eq('id', req.params.id)
      .single();
    if (error?.code === 'PGRST116') return res.status(404).json({ error: 'Account not found' });
    if (error) return res.status(500).json({ error: 'Database error' });
    res.json({ account: data });
  } catch (err) {
    next({ status: 500, message: 'Failed to fetch account' });
  }
});

// PATCH /v1/accounts/:id
router.patch('/:id', async (req, res, next) => {
  try {
    const allowed = ['name', 'is_hidden', 'is_hidden_from_budgets', 'is_closed',
      'current_balance', 'available_balance'];
    const updates = { updated_at: new Date().toISOString() };
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    const { data, error } = await supabaseForUser(req.accessToken)
      .from('accounts')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error?.code === 'PGRST116') return res.status(404).json({ error: 'Account not found' });
    if (error) return res.status(500).json({ error: 'Database error' });
    res.json({ account: data });
  } catch (err) {
    next({ status: 500, message: 'Failed to update account' });
  }
});

// DELETE /v1/accounts/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const { error } = await supabaseForUser(req.accessToken)
      .from('accounts')
      .delete()
      .eq('id', req.params.id);
    if (error) return res.status(500).json({ error: 'Database error' });
    res.json({ success: true });
  } catch (err) {
    next({ status: 500, message: 'Failed to delete account' });
  }
});

// GET /v1/consents
router.get('/consents', async (req, res, next) => {
  try {
    const { data, error } = await supabaseForUser(req.accessToken)
      .from('consent_grants')
      .select('*')
      .order('granted_at', { ascending: false });
    if (error) return res.status(500).json({ error: 'Database error' });
    res.json({ consents: data });
  } catch (err) {
    next({ status: 500, message: 'Failed to fetch consents' });
  }
});

// POST /v1/consents/:id/revoke
router.post('/consents/:id/revoke', async (req, res, next) => {
  try {
    const { data, error } = await supabaseForUser(req.accessToken)
      .from('consent_grants')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error?.code === 'PGRST116') return res.status(404).json({ error: 'Consent grant not found' });
    if (error) return res.status(500).json({ error: 'Database error' });
    res.json({ success: true });
  } catch (err) {
    next({ status: 500, message: 'Failed to revoke consent' });
  }
});

module.exports = router;
