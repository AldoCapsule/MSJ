const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');
const { PlaidApi, PlaidEnvironments, Configuration } = require('plaid');
const { verifyFirebaseToken } = require('../../middleware/auth');

const db = () => admin.firestore();

const plaidConfig = new Configuration({
  basePath: PlaidEnvironments[process.env.PLAID_ENV || 'sandbox'],
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
      'PLAID-SECRET': process.env.PLAID_SECRET,
    },
  },
});
const plaidClient = new PlaidApi(plaidConfig);

router.use(verifyFirebaseToken);

// GET /v1/connections
router.get('/', async (req, res, next) => {
  try {
    const snap = await db().collection('users').doc(req.uid).collection('connections')
      .orderBy('created_at', 'desc').get();
    res.json({ connections: snap.docs.map(d => ({ id: d.id, ...d.data() })) });
  } catch (err) {
    next({ status: 500, message: 'Failed to fetch connections' });
  }
});

// POST /v1/connections — called after Plaid Link completes
router.post('/', async (req, res, next) => {
  const { public_token, institution_id, institution_name, consent_scopes } = req.body;
  if (!public_token) return res.status(400).json({ error: 'public_token is required' });

  try {
    const exchangeResponse = await plaidClient.itemPublicTokenExchange({ public_token });
    const { access_token, item_id } = exchangeResponse.data;

    const ref = db().collection('users').doc(req.uid).collection('connections').doc();
    const connection = {
      id: ref.id,
      user_id: req.uid,
      institution_id: institution_id || null,
      institution_name: institution_name || 'Unknown',
      plaid_item_id: item_id,
      auth_type: 'oauth',
      status: 'active',
      last_success_at: admin.firestore.FieldValue.serverTimestamp(),
      error_code: null,
      error_detail: null,
      requires_mfa: false,
      remediation_hint: null,
      consent_scopes: consent_scopes || ['transactions'],
      created_at: admin.firestore.FieldValue.serverTimestamp(),
    };
    await ref.set(connection);

    // Store item_id → connection_id mapping for webhook routing
    await db().collection('plaid_item_index').doc(item_id).set({
      user_id: req.uid,
      connection_id: ref.id,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Store access token reference (in production: encrypt or use KMS)
    await db().collection('users').doc(req.uid).collection('plaid_tokens').doc(ref.id).set({
      access_token,
      item_id,
      connection_id: ref.id,
    });

    // Grant consent record
    const consentRef = db().collection('users').doc(req.uid).collection('consent_grants').doc();
    await consentRef.set({
      id: consentRef.id,
      user_id: req.uid,
      connection_id: ref.id,
      scopes: consent_scopes || ['transactions'],
      granted_at: admin.firestore.FieldValue.serverTimestamp(),
      revoked_at: null,
    });

    res.status(201).json({ connection, item_id });
  } catch (err) {
    console.error('[CONNECTIONS] POST error:', err.response?.data || err.message);
    next({ status: 502, message: 'Failed to create connection' });
  }
});

// POST /v1/connections/:id/refresh
router.post('/:id/refresh', async (req, res, next) => {
  try {
    const connRef = db().collection('users').doc(req.uid).collection('connections').doc(req.params.id);
    const connSnap = await connRef.get();
    if (!connSnap.exists) return res.status(404).json({ error: 'Connection not found' });

    const tokenSnap = await db().collection('users').doc(req.uid)
      .collection('plaid_tokens').doc(req.params.id).get();
    if (!tokenSnap.exists) return res.status(404).json({ error: 'Token not found' });

    // Create a refresh job
    const jobRef = db().collection('users').doc(req.uid).collection('refresh_jobs').doc();
    await jobRef.set({
      id: jobRef.id,
      connection_id: req.params.id,
      scheduled_at: admin.firestore.FieldValue.serverTimestamp(),
      started_at: admin.firestore.FieldValue.serverTimestamp(),
      status: 'running',
    });

    // Sync transactions
    const { access_token } = tokenSnap.data();
    const syncResponse = await plaidClient.transactionsSync({ access_token });
    const { added, modified, removed, next_cursor } = syncResponse.data;

    // Write to Firestore
    const batch = db().batch();
    const txnsCol = db().collection('users').doc(req.uid).collection('transactions');

    for (const txn of added) {
      const ref = txnsCol.doc(txn.transaction_id || txn.pending_transaction_id);
      batch.set(ref, {
        id: ref.id,
        name: txn.name,
        amount: txn.amount,
        date: new Date(txn.date || txn.authorized_date),
        accountId: txn.account_id,
        userId: req.uid,
        category: txn.category?.[0] || 'other',
        plaidTransactionId: txn.transaction_id,
        isPending: txn.pending || false,
        isManual: false,
        isHidden: false,
        reviewStatus: 'unreviewed',
        isTransfer: false,
        rawDescription: txn.original_description || txn.name,
        lastSyncedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    for (const txn of modified) {
      const ref = txnsCol.doc(txn.transaction_id);
      batch.update(ref, { amount: txn.amount, name: txn.name, isPending: txn.pending || false,
        lastSyncedAt: admin.firestore.FieldValue.serverTimestamp() });
    }

    for (const removed of (removed || [])) {
      if (removed.transaction_id) batch.delete(txnsCol.doc(removed.transaction_id));
    }

    if (added.length + modified.length + removed.length > 0) await batch.commit();

    await jobRef.update({ status: 'completed',
      finished_at: admin.firestore.FieldValue.serverTimestamp(),
      transactions_added: added.length, transactions_modified: modified.length,
      transactions_removed: removed.length });
    await connRef.update({ last_success_at: admin.firestore.FieldValue.serverTimestamp(),
      status: 'active', error_code: null });

    res.json({ job_id: jobRef.id, added: added.length, modified: modified.length,
      removed: removed.length, next_cursor });
  } catch (err) {
    console.error('[CONNECTIONS] refresh error:', err.response?.data || err.message);
    const errCode = err.response?.data?.error_code;
    await db().collection('users').doc(req.uid).collection('connections').doc(req.params.id)
      .update({ status: 'error', error_code: errCode || 'UNKNOWN',
        error_detail: err.message, remediation_hint: errCode === 'ITEM_LOGIN_REQUIRED'
          ? 'Re-authenticate your bank connection.' : 'Please try again later.' }).catch(() => {});
    next({ status: 502, message: 'Failed to refresh connection' });
  }
});

// GET /v1/connections/:id/refresh-jobs
router.get('/:id/refresh-jobs', async (req, res, next) => {
  try {
    const snap = await db().collection('users').doc(req.uid).collection('refresh_jobs')
      .where('connection_id', '==', req.params.id)
      .orderBy('scheduled_at', 'desc').limit(20).get();
    res.json({ jobs: snap.docs.map(d => ({ id: d.id, ...d.data() })) });
  } catch (err) {
    next({ status: 500, message: 'Failed to fetch refresh jobs' });
  }
});

// POST /v1/connections/:id/repair — initiate re-link flow
router.post('/:id/repair', async (req, res, next) => {
  try {
    const connRef = db().collection('users').doc(req.uid).collection('connections').doc(req.params.id);
    const connSnap = await connRef.get();
    if (!connSnap.exists) return res.status(404).json({ error: 'Connection not found' });

    const tokenSnap = await db().collection('users').doc(req.uid)
      .collection('plaid_tokens').doc(req.params.id).get();
    if (!tokenSnap.exists) return res.status(404).json({ error: 'Token not found' });

    const { access_token } = tokenSnap.data();
    const linkResponse = await plaidClient.linkTokenCreate({
      user: { client_user_id: req.uid },
      client_name: 'MansajeBudget',
      access_token,
      language: 'en',
      country_codes: ['US'],
    });

    await connRef.update({ status: 'repairing' });
    res.json({ link_token: linkResponse.data.link_token });
  } catch (err) {
    console.error('[CONNECTIONS] repair error:', err.response?.data || err.message);
    next({ status: 502, message: 'Failed to initiate repair' });
  }
});

module.exports = router;
