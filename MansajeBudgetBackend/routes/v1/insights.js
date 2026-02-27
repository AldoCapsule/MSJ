'use strict';
const express = require('express');
const router = express.Router();
const Anthropic = require('@anthropic-ai/sdk');
const { verifyFirebaseToken } = require('../../middleware/auth');
const { supabaseForUser } = require('../../db');
const { heavyLimiter } = require('../../middleware/rateLimiter');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

router.use(verifyFirebaseToken);
router.use(heavyLimiter);

// GET /v1/insights/monthly?month=YYYY-MM
router.get('/monthly', async (req, res, next) => {
  try {
    const { month } = req.query;
    const targetMonth = month ||
      `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    const [year, mon] = targetMonth.split('-').map(Number);

    // Check cache first (unique on user_id + month)
    const { data: cached } = await supabaseForUser(req.accessToken)
      .from('insight_snapshots')
      .select('*')
      .eq('month', targetMonth)
      .maybeSingle();
    if (cached) return res.json({ insight: cached });

    const start = new Date(year, mon - 1, 1).toISOString().slice(0, 10);
    const end = new Date(year, mon, 1).toISOString().slice(0, 10);

    const { data: txns, error: txnErr } = await supabaseForUser(req.accessToken)
      .from('transactions')
      .select('amount, category, category_id, is_transfer, is_hidden, date')
      .gte('date', start)
      .lt('date', end)
      .eq('is_transfer', false)
      .eq('is_hidden', false);
    if (txnErr) return res.status(500).json({ error: 'Database error' });

    if (!txns || txns.length === 0) {
      return res.json({ insight: { month: targetMonth,
        summary: 'No transactions found for this month.',
        anomalies: [], top_categories: [], generated_at: new Date() } });
    }

    // Prior month for comparison
    const prevStart = new Date(year, mon - 2, 1).toISOString().slice(0, 10);
    const { data: prevTxns } = await supabaseForUser(req.accessToken)
      .from('transactions')
      .select('amount, category, category_id, is_transfer, is_hidden')
      .gte('date', prevStart)
      .lt('date', start)
      .eq('is_transfer', false)
      .eq('is_hidden', false);

    const income = txns.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
    const expenses = txns.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
    const prevExpenses = (prevTxns || []).filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);

    const byCat = {};
    for (const t of txns.filter(t => t.amount > 0)) {
      const cat = t.category_id || t.category || 'other';
      byCat[cat] = (byCat[cat] || 0) + t.amount;
    }
    const topCats = Object.entries(byCat).sort(([, a], [, b]) => b - a).slice(0, 5)
      .map(([cat, amount]) => ({ category: cat, amount: Math.round(amount * 100) / 100 }));

    const prevByCat = {};
    for (const t of (prevTxns || []).filter(t => t.amount > 0)) {
      const cat = t.category_id || t.category || 'other';
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

    const anomalies = [];
    for (const [cat, amount] of Object.entries(byCat)) {
      const prev = prevByCat[cat] || 0;
      if (prev > 0 && amount > prev * 2 && amount > 50) {
        anomalies.push({ category: cat, current: amount, prior: prev,
          increase_pct: Math.round((amount - prev) / prev * 100) });
      }
    }

    const insight = {
      user_id: req.uid,
      month: targetMonth,
      summary,
      income_total: Math.round(income * 100) / 100,
      expense_total: Math.round(expenses * 100) / 100,
      net_total: Math.round((income - expenses) * 100) / 100,
      mom_change_pct: prevExpenses > 0
        ? Math.round((expenses - prevExpenses) / prevExpenses * 1000) / 10 : null,
      top_categories: topCats,
      anomalies,
      generated_at: new Date().toISOString(),
    };

    // Upsert with unique(user_id, month)
    await supabaseForUser(req.accessToken)
      .from('insight_snapshots')
      .upsert(insight, { onConflict: 'user_id,month' });

    res.json({ insight });
  } catch (err) {
    console.error('[INSIGHTS] error:', err.message);
    next({ status: 500, message: 'Failed to generate insights' });
  }
});

module.exports = router;
