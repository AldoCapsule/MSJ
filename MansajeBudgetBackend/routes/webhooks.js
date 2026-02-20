const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');
const { PlaidApi, PlaidEnvironments, Configuration } = require('plaid');

// Initialize Plaid client (same as plaid.js)
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

// ─────────────────────────────────────────────────────────────
// POST /webhooks/plaid
// Plaid webhook handler — receives transaction/item updates
// No Firebase auth here; Plaid sends these directly.
// Verify webhook authenticity in production using Plaid's verification headers.
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

      default:
        console.log('[WEBHOOK] Unhandled webhook type:', webhook_type);
    }
  } catch (err) {
    console.error('[WEBHOOK] Handler error:', err.message);
  }
});

// ─────────────────────────────────────────────────────────────
// Transaction webhooks
// ─────────────────────────────────────────────────────────────
async function handleTransactionWebhook(code, itemId, body) {
  switch (code) {
    case 'SYNC_UPDATES_AVAILABLE':
      console.log(`[WEBHOOK] New transactions available for item ${itemId}`);
      // In production: look up which user owns this item_id (store item_id → uid mapping
      // in Firestore), then trigger a sync for that user.
      // Example:
      //   const uid = await getUidForItemId(itemId);
      //   await syncTransactionsForUser(uid, accessToken);
      break;

    case 'INITIAL_UPDATE':
      console.log(`[WEBHOOK] Initial transaction pull complete for item ${itemId}`);
      break;

    case 'HISTORICAL_UPDATE':
      console.log(`[WEBHOOK] Historical transactions ready for item ${itemId}`);
      break;

    case 'TRANSACTIONS_REMOVED':
      console.log(`[WEBHOOK] Transactions removed for item ${itemId}`, body.removed_transactions);
      // In production: delete removed transaction IDs from Firestore
      break;

    default:
      console.log('[WEBHOOK] Unhandled TRANSACTIONS code:', code);
  }
}

// ─────────────────────────────────────────────────────────────
// Item webhooks
// ─────────────────────────────────────────────────────────────
async function handleItemWebhook(code, itemId, error) {
  switch (code) {
    case 'ERROR':
      console.error(`[WEBHOOK] Item error for ${itemId}:`, error);
      // In production: notify the user that re-authentication is needed
      break;

    case 'PENDING_EXPIRATION':
      console.warn(`[WEBHOOK] Item ${itemId} access token expiring soon`);
      break;

    case 'USER_PERMISSION_REVOKED':
      console.warn(`[WEBHOOK] User revoked permissions for item ${itemId}`);
      // In production: remove the item from user's account
      break;

    case 'NEW_ACCOUNTS_AVAILABLE':
      console.log(`[WEBHOOK] New accounts available for item ${itemId}`);
      break;

    default:
      console.log('[WEBHOOK] Unhandled ITEM code:', code);
  }
}

module.exports = router;
