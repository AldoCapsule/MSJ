const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');
const { PlaidApi, PlaidEnvironments, Configuration } = require('plaid');

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
const db = () => admin.firestore();

// ─────────────────────────────────────────────────────────────
// POST /webhooks/plaid
// Plaid sends these directly — no Firebase auth here.
// Verify webhook authenticity via Plaid-Verification header in production.
// ─────────────────────────────────────────────────────────────
router.post('/plaid', async (req, res) => {
  const { webhook_type, webhook_code, item_id, error } = req.body;

  console.log(`[WEBHOOK] type=${webhook_type} code=${webhook_code} item=${item_id}`);

  // Always respond 200 quickly so Plaid doesn't retry
  res.status(200).json({ received: true });

  try {
    switch (webhook_type) {
      case 'TRANSACTIONS':
        await handleTransactionWebhook(webhook_code, item_id, req.body);
        break;
      case 'ITEM':
        await handleItemWebhook(webhook_code, item_id, error);
        break;
      case 'AUTH':
        console.log('[WEBHOOK] Auth webhook received:', webhook_code);
        break;
      case 'INVESTMENTS_TRANSACTIONS':
        console.log('[WEBHOOK] Investment transaction webhook:', webhook_code, item_id);
        break;
      default:
        console.log('[WEBHOOK] Unhandled webhook type:', webhook_type);
    }
  } catch (err) {
    console.error('[WEBHOOK] Handler error:', err.message);
  }
});

// ─────────────────────────────────────────────────────────────
// Look up which user owns a given Plaid item_id
// ─────────────────────────────────────────────────────────────
async function resolveUid(itemId) {
  const doc = await db().collection('plaid_item_index').doc(itemId).get();
  if (!doc.exists) return null;
  return doc.data().user_id;
}

// ─────────────────────────────────────────────────────────────
// Transaction webhooks
// ─────────────────────────────────────────────────────────────
async function handleTransactionWebhook(code, itemId, body) {
  switch (code) {
    case 'SYNC_UPDATES_AVAILABLE': {
      console.log(`[WEBHOOK] New transactions available for item ${itemId}`);
      const uid = await resolveUid(itemId);
      if (!uid) { console.warn('[WEBHOOK] Unknown item_id:', itemId); return; }

      // Look up the connection and token
      const connSnap = await db().collection('users').doc(uid).collection('connections')
        .where('plaid_item_id', '==', itemId).limit(1).get();
      if (connSnap.empty) { console.warn('[WEBHOOK] No connection found for item:', itemId); return; }

      const connectionId = connSnap.docs[0].id;
      const tokenSnap = await db().collection('users').doc(uid).collection('plaid_tokens').doc(connectionId).get();
      if (!tokenSnap.exists) { console.warn('[WEBHOOK] No token for connection:', connectionId); return; }

      const { access_token } = tokenSnap.data();
      let cursor = connSnap.docs[0].data().sync_cursor || undefined;
      let added = [], modified = [], removed = [], hasMore = true;

      while (hasMore) {
        const syncResp = await plaidClient.transactionsSync({ access_token, cursor, count: 500 });
        added = added.concat(syncResp.data.added);
        modified = modified.concat(syncResp.data.modified);
        removed = removed.concat(syncResp.data.removed);
        cursor = syncResp.data.next_cursor;
        hasMore = syncResp.data.has_more;
      }

      const batch = db().batch();
      const txnsCol = db().collection('users').doc(uid).collection('transactions');

      for (const txn of added) {
        const ref = txnsCol.doc(txn.transaction_id);
        batch.set(ref, {
          id: ref.id,
          name: txn.name,
          amount: txn.amount,
          date: new Date(txn.date || txn.authorized_date),
          accountId: txn.account_id,
          userId: uid,
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
        batch.update(txnsCol.doc(txn.transaction_id), {
          amount: txn.amount, name: txn.name, isPending: txn.pending || false,
          lastSyncedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
      for (const r of removed) {
        if (r.transaction_id) batch.delete(txnsCol.doc(r.transaction_id));
      }

      if (added.length + modified.length + removed.length > 0) await batch.commit();

      // Persist cursor
      await connSnap.docs[0].ref.update({
        sync_cursor: cursor, last_success_at: admin.firestore.FieldValue.serverTimestamp(),
      });
      console.log(`[WEBHOOK] Synced ${added.length} added, ${modified.length} modified, ${removed.length} removed for ${uid}`);
      break;
    }

    case 'INITIAL_UPDATE':
      console.log(`[WEBHOOK] Initial transaction pull complete for item ${itemId}`);
      break;

    case 'HISTORICAL_UPDATE':
      console.log(`[WEBHOOK] Historical transactions ready for item ${itemId}`);
      break;

    case 'TRANSACTIONS_REMOVED': {
      const uid = await resolveUid(itemId);
      if (!uid) return;
      const removedIds = body.removed_transactions || [];
      const batch = db().batch();
      for (const id of removedIds) {
        batch.delete(db().collection('users').doc(uid).collection('transactions').doc(id));
      }
      if (removedIds.length > 0) await batch.commit();
      console.log(`[WEBHOOK] Removed ${removedIds.length} transactions for ${uid}`);
      break;
    }

    default:
      console.log('[WEBHOOK] Unhandled TRANSACTIONS code:', code);
  }
}

// ─────────────────────────────────────────────────────────────
// Item webhooks
// ─────────────────────────────────────────────────────────────
async function handleItemWebhook(code, itemId, error) {
  const uid = await resolveUid(itemId);

  switch (code) {
    case 'ERROR': {
      console.error(`[WEBHOOK] Item error for ${itemId}:`, error);
      if (!uid) return;
      const connSnap = await db().collection('users').doc(uid).collection('connections')
        .where('plaid_item_id', '==', itemId).limit(1).get();
      if (!connSnap.empty) {
        await connSnap.docs[0].ref.update({
          status: 'error',
          error_code: error?.error_code || 'UNKNOWN',
          error_detail: error?.error_message || '',
          remediation_hint: error?.error_code === 'ITEM_LOGIN_REQUIRED'
            ? 'Your bank requires re-authentication. Tap to reconnect.' : 'Please try again later.',
        });
      }
      break;
    }
    case 'PENDING_EXPIRATION':
      console.warn(`[WEBHOOK] Item ${itemId} access token expiring soon`);
      if (uid) {
        const connSnap = await db().collection('users').doc(uid).collection('connections')
          .where('plaid_item_id', '==', itemId).limit(1).get();
        if (!connSnap.empty) {
          await connSnap.docs[0].ref.update({ status: 'expiring_soon' });
        }
      }
      break;
    case 'USER_PERMISSION_REVOKED':
      console.warn(`[WEBHOOK] User revoked permissions for item ${itemId}`);
      if (uid) {
        const connSnap = await db().collection('users').doc(uid).collection('connections')
          .where('plaid_item_id', '==', itemId).limit(1).get();
        if (!connSnap.empty) {
          await connSnap.docs[0].ref.update({ status: 'revoked' });
        }
        await db().collection('plaid_item_index').doc(itemId).delete();
      }
      break;
    case 'NEW_ACCOUNTS_AVAILABLE':
      console.log(`[WEBHOOK] New accounts available for item ${itemId}`);
      break;
    default:
      console.log('[WEBHOOK] Unhandled ITEM code:', code);
  }
}

module.exports = router;
