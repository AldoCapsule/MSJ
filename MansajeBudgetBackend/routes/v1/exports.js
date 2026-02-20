const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');
const { verifyFirebaseToken } = require('../../middleware/auth');
const { heavyLimiter } = require('../../middleware/rateLimiter');

const db = () => admin.firestore();

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
    const jobRef = db().collection('users').doc(req.uid).collection('export_jobs').doc();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h
    await jobRef.set({
      id: jobRef.id,
      user_id: req.uid,
      type,
      format,
      from: from || null,
      to: to || null,
      status: 'processing',
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      expires_at: expiresAt,
    });

    // Build export data
    let data;
    const fromDate = from ? new Date(from) : new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    const toDate = to ? new Date(to) : new Date();

    if (type === 'transactions') {
      const snap = await db().collection('users').doc(req.uid).collection('transactions')
        .where('date', '>=', fromDate).where('date', '<=', toDate)
        .orderBy('date', 'desc').get();
      const rows = snap.docs.map(d => {
        const t = d.data();
        const d2 = t.date?.toDate?.() || new Date(t.date);
        return { id: d.id, date: d2.toISOString().slice(0, 10), name: t.name,
          amount: t.amount, category: t.category || t.categoryId, account: t.accountId,
          notes: t.notes || '', is_pending: t.isPending, is_manual: t.isManual };
      });
      data = format === 'json' ? JSON.stringify({ transactions: rows }, null, 2)
        : formatCSV(rows, ['id', 'date', 'name', 'amount', 'category', 'account', 'notes', 'is_pending', 'is_manual']);
    } else if (type === 'balances') {
      const snap = await db().collection('users').doc(req.uid).collection('accounts').get();
      const rows = snap.docs.map(d => {
        const a = d.data();
        return { id: d.id, name: a.name, type: a.type, balance: a.balance || a.balance_current,
          institution: a.institutionName, mask: a.mask || '' };
      });
      data = format === 'json' ? JSON.stringify({ accounts: rows }, null, 2)
        : formatCSV(rows, ['id', 'name', 'type', 'balance', 'institution', 'mask']);
    } else {
      data = JSON.stringify({ note: 'Full export not yet implemented for type: ' + type });
    }

    await jobRef.update({ status: 'completed',
      completed_at: admin.firestore.FieldValue.serverTimestamp(),
      row_count: data.split('\n').length });

    // Return inline (small datasets); large datasets would use signed URL to Cloud Storage
    const contentType = format === 'json' ? 'application/json' : 'text/csv';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="mansajebudget-${type}-${Date.now()}.${format}"`);
    res.send(data);
  } catch (err) {
    console.error('[EXPORTS] error:', err.message);
    next({ status: 500, message: 'Failed to generate export' });
  }
});

// GET /v1/exports/:id
router.get('/:id', async (req, res, next) => {
  try {
    const snap = await db().collection('users').doc(req.uid)
      .collection('export_jobs').doc(req.params.id).get();
    if (!snap.exists) return res.status(404).json({ error: 'Export job not found' });
    res.json({ export: { id: snap.id, ...snap.data() } });
  } catch (err) {
    next({ status: 500, message: 'Failed to fetch export job' });
  }
});

// POST /v1/privacy/delete
router.post('/privacy/delete', async (req, res, next) => {
  try {
    const ref = db().collection('users').doc(req.uid).collection('deletion_requests').doc();
    await ref.set({
      id: ref.id,
      user_id: req.uid,
      requested_at: admin.firestore.FieldValue.serverTimestamp(),
      status: 'pending',
      completed_at: null,
    });
    res.json({ request_id: ref.id, status: 'pending',
      message: 'Deletion request received. Your data will be permanently deleted within 30 days.' });
  } catch (err) {
    next({ status: 500, message: 'Failed to submit deletion request' });
  }
});

// GET /v1/privacy/delete/:id/status
router.get('/privacy/delete/:id/status', async (req, res, next) => {
  try {
    const snap = await db().collection('users').doc(req.uid)
      .collection('deletion_requests').doc(req.params.id).get();
    if (!snap.exists) return res.status(404).json({ error: 'Deletion request not found' });
    res.json({ request: { id: snap.id, ...snap.data() } });
  } catch (err) {
    next({ status: 500, message: 'Failed to fetch deletion request' });
  }
});

module.exports = router;
