const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');
const Anthropic = require('@anthropic-ai/sdk');
const { verifyFirebaseToken } = require('../../middleware/auth');
const { heavyLimiter } = require('../../middleware/rateLimiter');

const db = () => admin.firestore();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

router.use(verifyFirebaseToken);
router.use(heavyLimiter);

// GET /v1/insights/monthly?month=YYYY-MM
router.get('/monthly', async (req, res, next) => {
  try {
    const { month } = req.query;
    const targetMonth = month || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    const [year, mon] = targetMonth.split('-').map(Number);

    // Check cache first
    const cacheRef = db().collection('users').doc(req.uid).collection('insight_snapshots').doc(targetMonth);
    const cached = await cacheRef.get();
    if (cached.exists) {
      return res.json({ insight: { month: targetMonth, ...cached.data() } });
    }

    // Fetch current month transactions
    const start = new Date(year, mon - 1, 1);
    const end = new Date(year, mon, 1);
    const snap = await db().collection('users').doc(req.uid).collection('transactions')
      .where('date', '>=', start).where('date', '<', end).get();
    const txns = snap.docs.map(d => d.data()).filter(t => !t.isTransfer && !t.isHidden);

    if (txns.length === 0) {
      return res.json({ insight: { month: targetMonth, summary: 'No transactions found for this month.',
        anomalies: [], top_categories: [], generated_at: new Date() } });
    }

    // Fetch prior month for comparison
    const prevStart = new Date(year, mon - 2, 1);
    const prevSnap = await db().collection('users').doc(req.uid).collection('transactions')
      .where('date', '>=', prevStart).where('date', '<', start).get();
    const prevTxns = prevSnap.docs.map(d => d.data()).filter(t => !t.isTransfer && !t.isHidden);

    // Build metrics
    const income = txns.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
    const expenses = txns.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
    const prevExpenses = prevTxns.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);

    const byCat = {};
    for (const t of txns.filter(t => t.amount > 0)) {
      const cat = t.categoryId || t.category || 'other';
      byCat[cat] = (byCat[cat] || 0) + t.amount;
    }
    const topCats = Object.entries(byCat).sort(([, a], [, b]) => b - a).slice(0, 5)
      .map(([cat, amount]) => ({ category: cat, amount: Math.round(amount * 100) / 100 }));

    const prevByCat = {};
    for (const t of prevTxns.filter(t => t.amount > 0)) {
      const cat = t.categoryId || t.category || 'other';
      prevByCat[cat] = (prevByCat[cat] || 0) + t.amount;
    }

    const metricsText = `
Month: ${targetMonth}
Total income: $${income.toFixed(2)}
Total expenses: $${expenses.toFixed(2)}
Net: $${(income - expenses).toFixed(2)}
Prior month expenses: $${prevExpenses.toFixed(2)}
Month-over-month change: ${prevExpenses > 0 ? ((expenses - prevExpenses) / prevExpenses * 100).toFixed(1) : 'N/A'}%
Top spending categories: ${topCats.map(c => `${c.category}: $${c.amount}`).join(', ')}
Prior month top categories: ${Object.entries(prevByCat).sort(([, a], [, b]) => b - a).slice(0, 3).map(([c, v]) => `${c}: $${v.toFixed(0)}`).join(', ')}
Transaction count: ${txns.length}
    `.trim();

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      messages: [{
        role: 'user',
        content: `You are a personal finance assistant. Analyze this user's monthly spending data and provide a brief, friendly, actionable insight summary (3-4 sentences max). Highlight the most notable pattern, any concerning change, and one concrete suggestion. Do not use dollar signs in headings. Keep it conversational.\n\n${metricsText}`,
      }],
    });

    const summary = message.content[0].type === 'text' ? message.content[0].text : '';

    // Detect anomalies: category spending > 2x prior month
    const anomalies = [];
    for (const [cat, amount] of Object.entries(byCat)) {
      const prev = prevByCat[cat] || 0;
      if (prev > 0 && amount > prev * 2 && amount > 50) {
        anomalies.push({ category: cat, current: amount, prior: prev,
          increase_pct: Math.round((amount - prev) / prev * 100) });
      }
    }

    const insight = {
      month: targetMonth,
      summary,
      income_total: Math.round(income * 100) / 100,
      expense_total: Math.round(expenses * 100) / 100,
      net_total: Math.round((income - expenses) * 100) / 100,
      mom_change_pct: prevExpenses > 0 ? Math.round((expenses - prevExpenses) / prevExpenses * 1000) / 10 : null,
      top_categories: topCats,
      anomalies,
      generated_at: admin.firestore.FieldValue.serverTimestamp(),
    };

    await cacheRef.set(insight);
    res.json({ insight: { ...insight, generated_at: new Date() } });
  } catch (err) {
    console.error('[INSIGHTS] error:', err.message);
    next({ status: 500, message: 'Failed to generate insights' });
  }
});

module.exports = router;
