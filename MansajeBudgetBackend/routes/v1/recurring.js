const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');
const { verifyFirebaseToken } = require('../../middleware/auth');

const db = () => admin.firestore();

router.use(verifyFirebaseToken);

// Cadence detection heuristics (days between transactions)
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
    case 'weekly': d.setDate(d.getDate() + 7); break;
    case 'monthly': d.setMonth(d.getMonth() + 1); break;
    case 'quarterly': d.setMonth(d.getMonth() + 3); break;
    case 'annual': d.setFullYear(d.getFullYear() + 1); break;
  }
  return d;
}

// POST /v1/recurring/recompute — analyse transactions to detect recurring charges
router.post('/recompute', async (req, res, next) => {
  try {
    const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    const snap = await db().collection('users').doc(req.uid).collection('transactions')
      .where('date', '>=', oneYearAgo).where('isTransfer', '==', false).get();

    const txns = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => new Date(a.date?.toDate?.() || a.date) - new Date(b.date?.toDate?.() || b.date));

    // Group by normalised merchant name
    const byMerchant = {};
    for (const txn of txns) {
      const key = (txn.name || '').toLowerCase().trim().replace(/\s+#?\d+$/, '');
      if (!byMerchant[key]) byMerchant[key] = [];
      byMerchant[key].push(txn);
    }

    const detected = [];
    for (const [merchantKey, merchantTxns] of Object.entries(byMerchant)) {
      if (merchantTxns.length < 2) continue;

      const dates = merchantTxns.map(t => new Date(t.date?.toDate?.() || t.date));
      const intervals = [];
      for (let i = 1; i < dates.length; i++) {
        intervals.push((dates[i] - dates[i - 1]) / (1000 * 60 * 60 * 24));
      }

      // Only flag as recurring if intervals are consistent (variance < 50%)
      const avg = intervals.reduce((s, v) => s + v, 0) / intervals.length;
      const variance = intervals.reduce((s, v) => s + Math.abs(v - avg), 0) / intervals.length;
      if (variance > avg * 0.5) continue;

      const cadence = detectCadence(intervals);
      const lastTxn = merchantTxns[merchantTxns.length - 1];
      const lastDate = lastTxn.date?.toDate?.() || new Date(lastTxn.date);
      const amounts = merchantTxns.map(t => t.amount);
      const lastAmount = amounts[amounts.length - 1];
      const priceChanged = amounts.some(a => Math.abs(a - lastAmount) > 0.01);

      const priceHistory = merchantTxns.map(t => ({
        date: (t.date?.toDate?.() || new Date(t.date)).toISOString().slice(0, 10),
        amount: t.amount,
      }));

      detected.push({ merchantName: lastTxn.name, cadence, lastAmount, priceChangeFlag: priceChanged,
        nextDueDate: nextDueDate(lastDate, cadence), priceHistory });
    }

    // Write detected entities to Firestore
    const batch = db().batch();
    const col = db().collection('users').doc(req.uid).collection('recurring_entities');

    // Clear old detected entries
    const oldSnap = await col.where('is_user_created', '==', false).get();
    oldSnap.docs.forEach(d => batch.delete(d.ref));

    for (const entity of detected) {
      const ref = col.doc();
      batch.set(ref, {
        id: ref.id,
        user_id: req.uid,
        merchant_name: entity.merchantName,
        cadence: entity.cadence,
        next_due_date: entity.nextDueDate,
        last_amount: entity.lastAmount,
        is_subscription: true,
        price_change_flag: entity.priceChangeFlag,
        price_history: entity.priceHistory,
        is_user_created: false,
        created_at: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
    if (detected.length > 0 || oldSnap.size > 0) await batch.commit();

    res.json({ detected_count: detected.length, recurring: detected });
  } catch (err) {
    console.error('[RECURRING] recompute error:', err.message);
    next({ status: 500, message: 'Failed to recompute recurring' });
  }
});

// GET /v1/recurring
router.get('/', async (req, res, next) => {
  try {
    const snap = await db().collection('users').doc(req.uid).collection('recurring_entities')
      .orderBy('next_due_date').get();
    res.json({ recurring: snap.docs.map(d => ({ id: d.id, ...d.data() })) });
  } catch (err) {
    next({ status: 500, message: 'Failed to fetch recurring' });
  }
});

// GET /v1/recurring/upcoming?days=30
router.get('/upcoming', async (req, res, next) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const now = new Date();
    const until = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    const snap = await db().collection('users').doc(req.uid).collection('recurring_entities')
      .where('next_due_date', '>=', now).where('next_due_date', '<=', until)
      .orderBy('next_due_date').get();
    res.json({ upcoming: snap.docs.map(d => ({ id: d.id, ...d.data() })) });
  } catch (err) {
    next({ status: 500, message: 'Failed to fetch upcoming recurring' });
  }
});

module.exports = router;
