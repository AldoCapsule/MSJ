'use strict';
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { verifyFirebaseToken } = require('../../middleware/auth');
const { supabaseForUser } = require('../../db');
const { heavyLimiter } = require('../../middleware/rateLimiter');

const MAX_ROWS = 10000;

router.use(verifyFirebaseToken);
router.use(heavyLimiter);

function formatCSV(rows, headers) {
  const escape = v => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(',')];
  for (const row of rows) lines.push(headers.map(h => escape(row[h])).join(','));
  return lines.join('\n');
}

// POST /v1/exports
router.post('/', async (req, res, next) => {
  const { type = 'transactions', format = 'csv', from, to } = req.body;
  if (!['csv', 'json'].includes(format)) {
    return res.status(400).json({ error: 'format must be csv or json' });
  }
  try {
    const jobId = uuidv4();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await supabaseForUser(req.accessToken).from('export_jobs').insert({
      id: jobId,
      user_id: req.uid,
      type,
      format,
      from_date: from || null,
      to_date: to || null,
      status: 'processing',
      expires_at: expiresAt,
    });

    const fromDate = from || new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const toDate = to || new Date().toISOString().slice(0, 10);

    let outputData;
    if (type === 'transactions') {
      const { data: rows, error } = await supabaseForUser(req.accessToken)
        .from('transactions')
        .select('id, date, name, amount, category, category_id, account_id, notes, is_pending, is_manual')
        .gte('date', fromDate)
        .lte('date', toDate)
        .order('date', { ascending: false })
        .limit(MAX_ROWS);
      if (error) return res.status(500).json({ error: 'Database error' });

      const formatted = (rows || []).map(t => ({
        id: t.id, date: t.date, name: t.name, amount: t.amount,
        category: t.category || t.category_id, account: t.account_id,
        notes: t.notes || '', is_pending: t.is_pending, is_manual: t.is_manual,
      }));
      outputData = format === 'json'
        ? JSON.stringify({ transactions: formatted }, null, 2)
        : formatCSV(formatted, ['id', 'date', 'name', 'amount', 'category', 'account', 'notes', 'is_pending', 'is_manual']);
    } else if (type === 'balances') {
      const { data: rows, error } = await supabaseForUser(req.accessToken)
        .from('accounts')
        .select('id, name, type, current_balance, institution_name, mask')
        .limit(MAX_ROWS);
      if (error) return res.status(500).json({ error: 'Database error' });

      const formatted = (rows || []).map(a => ({
        id: a.id, name: a.name, type: a.type, balance: a.current_balance,
        institution: a.institution_name, mask: a.mask || '',
      }));
      outputData = format === 'json'
        ? JSON.stringify({ accounts: formatted }, null, 2)
        : formatCSV(formatted, ['id', 'name', 'type', 'balance', 'institution', 'mask']);
    } else {
      outputData = JSON.stringify({ note: 'Full export not yet implemented for type: ' + type });
    }

    const rowCount = (outputData.match(/\n/g) || []).length;
    await supabaseForUser(req.accessToken).from('export_jobs').update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      row_count: rowCount,
    }).eq('id', jobId);

    const contentType = format === 'json' ? 'application/json' : 'text/csv';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition',
      `attachment; filename="mansajebudget-${type}-${Date.now()}.${format}"`);
    res.send(outputData);
  } catch (err) {
    console.error('[EXPORTS] error:', err.message);
    next({ status: 500, message: 'Failed to generate export' });
  }
});

// GET /v1/exports/:id
router.get('/:id', async (req, res, next) => {
  try {
    const { data, error } = await supabaseForUser(req.accessToken)
      .from('export_jobs')
      .select('*')
      .eq('id', req.params.id)
      .single();
    if (error?.code === 'PGRST116') return res.status(404).json({ error: 'Export job not found' });
    if (error) return res.status(500).json({ error: 'Database error' });
    res.json({ export: data });
  } catch (err) {
    next({ status: 500, message: 'Failed to fetch export job' });
  }
});

// POST /v1/privacy/delete
router.post('/privacy/delete', async (req, res, next) => {
  try {
    const { data, error } = await supabaseForUser(req.accessToken)
      .from('deletion_requests')
      .insert({
        id: uuidv4(),
        user_id: req.uid,
        requested_at: new Date().toISOString(),
        status: 'pending',
        completed_at: null,
      })
      .select()
      .single();
    if (error) return res.status(500).json({ error: 'Database error' });
    res.json({ request_id: data.id, status: 'pending',
      message: 'Deletion request received. Your data will be permanently deleted within 30 days.' });
  } catch (err) {
    next({ status: 500, message: 'Failed to submit deletion request' });
  }
});

// GET /v1/privacy/delete/:id/status
router.get('/privacy/delete/:id/status', async (req, res, next) => {
  try {
    const { data, error } = await supabaseForUser(req.accessToken)
      .from('deletion_requests')
      .select('*')
      .eq('id', req.params.id)
      .single();
    if (error?.code === 'PGRST116') return res.status(404).json({ error: 'Deletion request not found' });
    if (error) return res.status(500).json({ error: 'Database error' });
    res.json({ request: data });
  } catch (err) {
    next({ status: 500, message: 'Failed to fetch deletion request' });
  }
});

module.exports = router;
