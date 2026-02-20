const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');
const { verifyFirebaseToken } = require('../../middleware/auth');

const db = () => admin.firestore();

router.use(verifyFirebaseToken);

// GET /v1/dashboard
router.get('/dashboard', async (req, res, next) => {
  try {
    const uid = req.uid;
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();

    const [accountsSnap, recentTxnsSnap, budgetsSnap] = await Promise.all([
      db().collection('users').doc(uid).collection('accounts').get(),
      db().collection('users').doc(uid).collection('transactions')
        .orderBy('date', 'desc').limit(10).get(),
      db().collection('users').doc(uid).collection('budgets')
        .where('month', '==', month).where('year', '==', year).get(),
    ]);

    const accounts = accountsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const transactions = recentTxnsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const budgets = budgetsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    const assets = accounts.filter(a => !['credit', 'loan'].includes(a.type))
      .reduce((s, a) => s + (a.balance || a.balance_current || 0), 0);
    const liabilities = accounts.filter(a => ['credit', 'loan'].includes(a.type))
      .reduce((s, a) => s + (a.balance || a.balance_current || 0), 0);

    const startOfMonth = new Date(year, month - 1, 1);
    const monthlyTxns = transactions.filter(t => t.date?.toDate?.() >= startOfMonth || new Date(t.date) >= startOfMonth);
    const monthlySpending = monthlyTxns.filter(t => (t.amount || 0) > 0 && !t.isTransfer)
      .reduce((s, t) => s + t.amount, 0);

    res.json({
      net_worth: assets - liabilities,
      assets_total: assets,
      liabilities_total: liabilities,
      monthly_spending: monthlySpending,
      budget_summary: {
        total_planned: budgets.reduce((s, b) => s + (b.limit || b.amount_planned || 0), 0),
        total_spent: budgets.reduce((s, b) => s + (b.spent || 0), 0),
      },
      recent_transactions: transactions.slice(0, 5),
      accounts: accounts.slice(0, 10),
    });
  } catch (err) {
    console.error('[REPORTS] dashboard error:', err.message);
    next({ status: 500, message: 'Failed to load dashboard' });
  }
});

// GET /v1/reports/spending?group_by=category&granularity=month
router.get('/spending', async (req, res, next) => {
  try {
    const { group_by = 'category', granularity = 'month', from, to } = req.query;
    const fromDate = from ? new Date(from) : new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);
    const toDate = to ? new Date(to) : new Date();

    const snap = await db().collection('users').doc(req.uid).collection('transactions')
      .where('date', '>=', fromDate).where('date', '<=', toDate)
      .orderBy('date', 'desc').get();

    const txns = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .filter(t => (t.amount || 0) > 0 && !t.isTransfer && !t.isHidden);

    const grouped = {};
    for (const txn of txns) {
      const d = txn.date?.toDate?.() || new Date(txn.date);
      let key;
      if (granularity === 'month') {
        key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      } else if (granularity === 'week') {
        const weekStart = new Date(d);
        weekStart.setDate(d.getDate() - d.getDay());
        key = weekStart.toISOString().slice(0, 10);
      } else {
        key = d.toISOString().slice(0, 10);
      }

      const subKey = group_by === 'category' ? (txn.categoryId || txn.category || 'other') : txn.accountId;
      if (!grouped[key]) grouped[key] = {};
      grouped[key][subKey] = (grouped[key][subKey] || 0) + txn.amount;
    }

    const result = Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([period, cats]) => ({
      period,
      breakdown: Object.entries(cats).map(([key, amount]) => ({ [group_by === 'category' ? 'category' : 'account']: key, amount })),
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
    const [year, mon] = (month || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`).split('-').map(Number);
    const start = new Date(year, mon - 1, 1);
    const end = new Date(year, mon, 1);

    const snap = await db().collection('users').doc(req.uid).collection('transactions')
      .where('date', '>=', start).where('date', '<', end).get();

    const txns = snap.docs.map(d => d.data()).filter(t => !t.isTransfer && !t.isHidden);
    const income = txns.filter(t => (t.amount || 0) < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
    const expenses = txns.filter(t => (t.amount || 0) > 0).reduce((s, t) => s + t.amount, 0);

    // Cache the result
    const summaryRef = db().collection('users').doc(req.uid).collection('cashflow_summaries')
      .doc(`${year}-${String(mon).padStart(2, '0')}`);
    await summaryRef.set({ user_id: req.uid, month: `${year}-${String(mon).padStart(2, '0')}`,
      income_total: income, expense_total: expenses, net_total: income - expenses,
      computed_at: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });

    res.json({ month: `${year}-${String(mon).padStart(2, '0')}`,
      income_total: income, expense_total: expenses, net_total: income - expenses });
  } catch (err) {
    console.error('[REPORTS] cashflow error:', err.message);
    next({ status: 500, message: 'Failed to generate cashflow report' });
  }
});

// GET /v1/reports/networth?from=&to=
router.get('/networth', async (req, res, next) => {
  try {
    const { from, to } = req.query;
    const fromDate = from ? new Date(from) : new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    const toDate = to ? new Date(to) : new Date();

    const snap = await db().collection('users').doc(req.uid).collection('networth_snapshots')
      .where('as_of_date', '>=', fromDate).where('as_of_date', '<=', toDate)
      .orderBy('as_of_date').get();

    const snapshots = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    // If no historical data, compute current
    if (snapshots.length === 0) {
      const accountsSnap = await db().collection('users').doc(req.uid).collection('accounts').get();
      const accounts = accountsSnap.docs.map(d => d.data());
      const assets = accounts.filter(a => !['credit', 'loan'].includes(a.type))
        .reduce((s, a) => s + (a.balance || a.balance_current || 0), 0);
      const debts = accounts.filter(a => ['credit', 'loan'].includes(a.type))
        .reduce((s, a) => s + (a.balance || a.balance_current || 0), 0);
      const nowSnapshot = { as_of_date: new Date(), assets_total: assets, debts_total: debts,
        net_worth_total: assets - debts };

      // Persist snapshot
      const snapshotRef = db().collection('users').doc(req.uid).collection('networth_snapshots').doc();
      await snapshotRef.set({ id: snapshotRef.id, user_id: req.uid, ...nowSnapshot });
      return res.json({ snapshots: [nowSnapshot] });
    }

    res.json({ snapshots });
  } catch (err) {
    console.error('[REPORTS] networth error:', err.message);
    next({ status: 500, message: 'Failed to fetch net worth history' });
  }
});

module.exports = router;
