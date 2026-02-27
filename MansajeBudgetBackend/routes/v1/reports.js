'use strict';
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { verifyFirebaseToken } = require('../../middleware/auth');
const { supabaseForUser } = require('../../db');

router.use(verifyFirebaseToken);

// GET /v1/dashboard
router.get('/dashboard', async (req, res, next) => {
  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().slice(0, 10);

    const [
      { data: accounts },
      { data: recentTxns },
      { data: budgets },
    ] = await Promise.all([
      supabaseForUser(req.accessToken).from('accounts').select('*'),
      supabaseForUser(req.accessToken).from('transactions').select('*')
        .order('date', { ascending: false }).limit(10),
      supabaseForUser(req.accessToken).from('budgets').select('*, budget_lines(*)')
        .gte('period_start', monthStart).lt('period_start', monthEnd),
    ]);

    const accs = accounts || [];
    const txns = recentTxns || [];
    const bdgs = budgets || [];

    const assets = accs.filter(a => !['credit', 'loan'].includes(a.type))
      .reduce((s, a) => s + (Number(a.current_balance) || 0), 0);
    const liabilities = accs.filter(a => ['credit', 'loan'].includes(a.type))
      .reduce((s, a) => s + (Number(a.current_balance) || 0), 0);

    const monthlyTxns = txns.filter(t => t.date >= monthStart);
    const monthlySpending = monthlyTxns
      .filter(t => (t.amount || 0) > 0 && !t.is_transfer && !t.is_hidden)
      .reduce((s, t) => s + t.amount, 0);

    const allLines = bdgs.flatMap(b => b.budget_lines || []);

    res.json({
      net_worth: assets - liabilities,
      assets_total: assets,
      liabilities_total: liabilities,
      monthly_spending: monthlySpending,
      budget_summary: {
        total_planned: allLines.reduce((s, l) => s + (l.amount_planned || 0), 0),
        total_spent: allLines.reduce((s, l) => s + (l.amount_actual_cached || 0), 0),
      },
      recent_transactions: txns.slice(0, 5),
      accounts: accs.slice(0, 10),
    });
  } catch (err) {
    console.error('[REPORTS] dashboard error:', err.message);
    next({ status: 500, message: 'Failed to load dashboard' });
  }
});

// GET /v1/reports/spending?group_by=category&granularity=month&from=&to=
router.get('/spending', async (req, res, next) => {
  try {
    const { group_by = 'category', granularity = 'month', from, to } = req.query;
    const fromDate = from || new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const toDate = to || new Date().toISOString().slice(0, 10);

    const { data, error } = await supabaseForUser(req.accessToken)
      .from('transactions')
      .select('date, amount, category, category_id, account_id, is_transfer, is_hidden')
      .gte('date', fromDate)
      .lte('date', toDate)
      .eq('is_transfer', false)
      .eq('is_hidden', false)
      .gt('amount', 0);
    if (error) return res.status(500).json({ error: 'Database error' });

    const grouped = {};
    for (const txn of (data || [])) {
      const d = new Date(txn.date);
      let key;
      if (granularity === 'month') {
        key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      } else if (granularity === 'week') {
        const weekStart = new Date(d);
        weekStart.setDate(d.getDate() - d.getDay());
        key = weekStart.toISOString().slice(0, 10);
      } else {
        key = txn.date.slice(0, 10);
      }
      const subKey = group_by === 'category'
        ? (txn.category_id || txn.category || 'other') : txn.account_id;
      if (!grouped[key]) grouped[key] = {};
      grouped[key][subKey] = (grouped[key][subKey] || 0) + txn.amount;
    }

    const result = Object.entries(grouped)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, cats]) => ({
        period,
        breakdown: Object.entries(cats).map(([key, amount]) => ({
          [group_by === 'category' ? 'category' : 'account']: key, amount,
        })),
        total: Object.values(cats).reduce((s, v) => s + v, 0),
      }));

    res.json({ spending: result });
  } catch (err) {
    console.error('[REPORTS] spending error:', err.message);
    next({ status: 500, message: 'Failed to generate spending report' });
  }
});

// GET /v1/reports/cashflow?month=YYYY-MM
router.get('/cashflow', async (req, res, next) => {
  try {
    const { month } = req.query;
    const targetMonth = month ||
      `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    const [year, mon] = targetMonth.split('-').map(Number);
    const start = new Date(year, mon - 1, 1).toISOString().slice(0, 10);
    const end = new Date(year, mon, 1).toISOString().slice(0, 10);

    const { data, error } = await supabaseForUser(req.accessToken)
      .from('transactions')
      .select('amount, is_transfer, is_hidden')
      .gte('date', start)
      .lt('date', end)
      .eq('is_transfer', false)
      .eq('is_hidden', false);
    if (error) return res.status(500).json({ error: 'Database error' });

    const txns = data || [];
    const income = txns.filter(t => (t.amount || 0) < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
    const expenses = txns.filter(t => (t.amount || 0) > 0).reduce((s, t) => s + t.amount, 0);

    // Upsert summary cache
    await supabaseForUser(req.accessToken)
      .from('cashflow_summaries')
      .upsert({
        user_id: req.uid,
        month: targetMonth,
        income_total: income,
        expense_total: expenses,
        net_total: income - expenses,
        computed_at: new Date().toISOString(),
      }, { onConflict: 'user_id,month' });

    res.json({ month: targetMonth, income_total: income, expense_total: expenses,
      net_total: income - expenses });
  } catch (err) {
    console.error('[REPORTS] cashflow error:', err.message);
    next({ status: 500, message: 'Failed to generate cashflow report' });
  }
});

// GET /v1/reports/networth?from=&to=
router.get('/networth', async (req, res, next) => {
  try {
    const { from, to } = req.query;
    const fromDate = from || new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const toDate = to || new Date().toISOString().slice(0, 10);

    const { data: snapshots, error } = await supabaseForUser(req.accessToken)
      .from('net_worth_snapshots')
      .select('*')
      .gte('snapshot_date', fromDate)
      .lte('snapshot_date', toDate)
      .order('snapshot_date');
    if (error) return res.status(500).json({ error: 'Database error' });

    if (snapshots && snapshots.length > 0) {
      return res.json({ snapshots });
    }

    // No historical data — compute current and persist
    const { data: accounts } = await supabaseForUser(req.accessToken)
      .from('accounts')
      .select('type, current_balance');
    const accs = accounts || [];
    const assets = accs.filter(a => !['credit', 'loan'].includes(a.type))
      .reduce((s, a) => s + (Number(a.current_balance) || 0), 0);
    const debts = accs.filter(a => ['credit', 'loan'].includes(a.type))
      .reduce((s, a) => s + (Number(a.current_balance) || 0), 0);

    const nowSnapshot = {
      id: uuidv4(),
      user_id: req.uid,
      snapshot_date: new Date().toISOString().slice(0, 10),
      total_assets: assets,
      total_liabilities: debts,
      net_worth: assets - debts,
    };
    await supabaseForUser(req.accessToken).from('net_worth_snapshots').insert(nowSnapshot);
    res.json({ snapshots: [nowSnapshot] });
  } catch (err) {
    console.error('[REPORTS] networth error:', err.message);
    next({ status: 500, message: 'Failed to fetch net worth history' });
  }
});

module.exports = router;
