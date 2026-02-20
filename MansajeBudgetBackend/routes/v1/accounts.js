const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');
const { verifyFirebaseToken } = require('../../middleware/auth');

const db = () => admin.firestore();

router.use(verifyFirebaseToken);

// GET /v1/accounts
router.get('/', async (req, res, next) => {
  try {
    const snap = await db().collection('users').doc(req.uid).collection('accounts')
      .orderBy('name').get();
    res.json({ accounts: snap.docs.map(d => ({ id: d.id, ...d.data() })) });
  } catch (err) {
    next({ status: 500, message: 'Failed to fetch accounts' });
  }
});

// PATCH /v1/accounts/:id
router.patch('/:id', async (req, res, next) => {
  try {
    const ref = db().collection('users').doc(req.uid).collection('accounts').doc(req.params.id);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: 'Account not found' });

    const allowed = ['name', 'isHidden', 'isHiddenFromBudgets', 'isClosed'];
    const updates = { updated_at: admin.firestore.FieldValue.serverTimestamp() };
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    await ref.update(updates);
    res.json({ account: { id: snap.id, ...snap.data(), ...updates } });
  } catch (err) {
    next({ status: 500, message: 'Failed to update account' });
  }
});

// GET /v1/consents
router.get('/consents', async (req, res, next) => {
  try {
    const snap = await db().collection('users').doc(req.uid).collection('consent_grants')
      .orderBy('granted_at', 'desc').get();
    res.json({ consents: snap.docs.map(d => ({ id: d.id, ...d.data() })) });
  } catch (err) {
    next({ status: 500, message: 'Failed to fetch consents' });
  }
});

// POST /v1/consents/:id/revoke
router.post('/consents/:id/revoke', async (req, res, next) => {
  try {
    const ref = db().collection('users').doc(req.uid).collection('consent_grants').doc(req.params.id);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: 'Consent grant not found' });
    await ref.update({ revoked_at: admin.firestore.FieldValue.serverTimestamp() });
    res.json({ success: true });
  } catch (err) {
    next({ status: 500, message: 'Failed to revoke consent' });
  }
});

module.exports = router;
