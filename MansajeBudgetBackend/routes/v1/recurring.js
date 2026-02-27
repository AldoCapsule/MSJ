'use strict';
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { verifyFirebaseToken } = require('../../middleware/auth');
const { supabaseForUser } = require('../../db');

router.use(verifyFirebaseToken);

function detectCadence(intervals) {
  if (!intervals.length) return 'monthly';
  const avg = intervals.reduce((s, v) => s + v, 0) / intervals.length;
  if (avg <= 9) return 'weekly';
  if (avg <= 35) return 'monthly';
  if (avg <= 100) return 'quarterly';
  return 'annual';
}

function nextDueDate(lastDate, cadence) {
  const d = new Date(lastDate);
  switch (cadence) {
    case 'weekly':    d.setDate(d.getDate() + 7); break;
    case 'monthly':   d.setMonth(d.getMonth() + 1); break;
    case 'quarterly': d.setMonth(d.getMonth() + 3); break;
    case 'annual':    d.setFullYear(d.getFullYear() + 1); break;
  }
  return d.toISOString().slice(0, 10);
}

// POST /v1/recurring/recompute
router.post('/recompute', async (req, res, next) => {
  try {
    const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const { data: txns, error } = await supabaseForUser(req.accessToken)
      .from('transactions')
      .select('id, name, amount, date')
      .gte('date', oneYearAgo)
      .eq('is_transfer', false)
      .order('date');
    if (error) return res.status(500).json({ error: 'Database error' });

    const byMerchant = {};
    for (const txn of (txns || [])) {
      const key = (txn.name || '').toLowerCase().trim().replace(/\s+#?\d+$/, '');
      if (!byMerchant[key]) byMerchant[key] = [];
      byMerchant[key].push(txn);
    }

    const detected = [];
    for (const [, merchantTxns] of Object.entries(byMerchant)) {
      if (merchantTxns.length < 2) continue;
      const dates = merchantTxns.map(t => new Date(t.date));
      const intervals = [];
      for (let i = 1; i < dates.length; i++) {
        intervals.push((dates[i] - dates[i - 1]) / (1000 * 60 * 60 * 24));
      }
      const avg = intervals.reduce((s, v) => s + v, 0) / intervals.length;
      const variance = intervals.reduce((s, v) => s + Math.abs(v - avg), 0) / intervals.length;
      if (variance > avg * 0.5) continue;

      const cadence = detectCadence(intervals);
      const lastTxn = merchantTxns[merchantTxns.length - 1];
      const amounts = merchantTxns.map(t => t.amount);
      const lastAmount = amounts[amounts.length - 1];
      const priceChanged = amounts.some(a => Math.abs(a - lastAmount) > 0.01);
      const priceHistory = merchantTxns.map(t => ({
        date: new Date(t.date).toISOString().slice(0, 10),
        amount: t.amount,
      }));

      detected.push({
        merchant_name: lastTxn.name,
        cadence,
        last_amount: lastAmount,
        price_change_flag: priceChanged,
        next_due_date: nextDueDate(lastTxn.date, cadence),
        price_history: priceHistory,
      });
    }

    // Clear old auto-detected entries
    await supabaseForUser(req.accessToken)
      .from('recurring_streams')
      .delete()
      .eq('is_user_created', false);

    if (detected.length > 0) {
      const rows = detected.map(e => ({
        id: uuidv4(),
        user_id: req.uid,
        merchant_name: e.merchant_name,
        cadence: e.cadence,
        next_due_date: e.next_due_date,
        last_amount: e.last_amount,
        is_subscription: true,
        price_change_flag: e.price_change_flag,
        price_history: e.price_history,
        is_user_created: false,
      }));
      await supabaseForUser(req.accessToken).from('recurring_streams').insert(rows);
    }

    res.json({ detected_count: detected.length, recurring: detected });
  } catch (err) {
    console.error('[RECURRING] recompute error:', err.message);
    next({ status: 500, message: 'Failed to recompute recurring' });
  }
});

// GET /v1/recurring
router.get('/', async (req, res, next) => {
  try {
    const { data, error } = await supabaseForUser(req.accessToken)
      .from('recurring_streams')
      .select('*')
      .order('next_due_date');
    if (error) return res.status(500).json({ error: 'Database error' });
    res.json({ recurring: data });
  } catch (err) {
    next({ status: 500, message: 'Failed to fetch recurring' });
  }
});

// GET /v1/recurring/upcoming?days=30
router.get('/upcoming', async (req, res, next) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const now = new Date().toISOString().slice(0, 10);
    const until = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const { data, error } = await supabaseForUser(req.accessToken)
      .from('recurring_streams')
      .select('*')
      .gte('next_due_date', now)
      .lte('next_due_date', until)
      .order('next_due_date');
    if (error) return res.status(500).json({ error: 'Database error' });
    res.json({ upcoming: data });
  } catch (err) {
    next({ status: 500, message: 'Failed to fetch upcoming recurring' });
  }
});

module.exports = router;
