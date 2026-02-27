'use strict';
const express = require('express');
const router = express.Router();
const { PlaidApi, PlaidEnvironments, Configuration } = require('plaid');
const { verifyPlaidWebhook } = require('../middleware/plaidWebhookVerification');
const { supabaseAdmin } = require('../db');

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
// Plaid sends these directly — no Firebase auth here.
// Signature is verified via ES256 JWT in the Plaid-Verification header.
// ─────────────────────────────────────────────────────────────
router.post('/plaid', verifyPlaidWebhook(plaidClient), async (req, res) => {
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
// Look up connection record by Plaid item_id
// ─────────────────────────────────────────────────────────────
async function resolveConnection(itemId) {
  const { data, error } = await supabaseAdmin
    .from('connections')
    .select('id, user_id, sync_cursor')
    .eq('plaid_item_id', itemId)
    .single();
  if (error || !data) return null;
  return data;
}

// ─────────────────────────────────────────────────────────────
// Transaction webhooks
// ─────────────────────────────────────────────────────────────
async function handleTransactionWebhook(code, itemId, body) {
  switch (code) {
    case 'SYNC_UPDATES_AVAILABLE': {
      console.log(`[WEBHOOK] New transactions available for item ${itemId}`);
      const conn = await resolveConnection(itemId);
      if (!conn) { console.warn('[WEBHOOK] Unknown item_id:', itemId); return; }

      const { data: accessToken, error: tokenErr } = await supabaseAdmin
        .rpc('get_plaid_token', { p_connection_id: conn.id });
      if (tokenErr || !accessToken) {
        console.warn('[WEBHOOK] No token for connection:', conn.id);
        return;
      }

      let cursor = conn.sync_cursor || undefined;
      let added = [], modified = [], removed = [], hasMore = true;

      while (hasMore) {
        const syncResp = await plaidClient.transactionsSync({
          access_token: accessToken, cursor, count: 500,
        });
        added = added.concat(syncResp.data.added);
        modified = modified.concat(syncResp.data.modified);
        removed = removed.concat(syncResp.data.removed);
        cursor = syncResp.data.next_cursor;
        hasMore = syncResp.data.has_more;
      }

      // Upsert added transactions (idempotent — plaid transaction_id is PK)
      if (added.length > 0) {
        await supabaseAdmin.from('transactions').upsert(
          added.map(txn => ({
            id: txn.transaction_id,
            user_id: conn.user_id,
            account_id: txn.account_id,
            name: txn.name,
            amount: txn.amount,
            date: txn.date || txn.authorized_date,
            category: txn.category?.[0] || 'other',
            is_pending: txn.pending || false,
            is_manual: false,
            is_hidden: false,
            is_transfer: false,
            review_status: 'unreviewed',
            raw_description: txn.original_description || txn.name,
            last_synced_at: new Date().toISOString(),
          })),
          { onConflict: 'id' }
        );
      }

      // Update modified transactions
      for (const txn of modified) {
        await supabaseAdmin.from('transactions')
          .update({
            amount: txn.amount, name: txn.name, is_pending: txn.pending || false,
            last_synced_at: new Date().toISOString(),
          })
          .eq('id', txn.transaction_id);
      }

      // Delete removed transactions
      const removedIds = removed.map(r => r.transaction_id).filter(Boolean);
      if (removedIds.length > 0) {
        await supabaseAdmin.from('transactions').delete().in('id', removedIds);
      }

      // Update sync cursor
      await supabaseAdmin.from('connections')
        .update({ sync_cursor: cursor, last_success_at: new Date().toISOString() })
        .eq('id', conn.id);

      console.log(`[WEBHOOK] Synced ${added.length} added, ${modified.length} modified, ${removed.length} removed for user ${conn.user_id}`);
      break;
    }

    case 'INITIAL_UPDATE':
      console.log(`[WEBHOOK] Initial transaction pull complete for item ${itemId}`);
      break;

    case 'HISTORICAL_UPDATE':
      console.log(`[WEBHOOK] Historical transactions ready for item ${itemId}`);
      break;

    case 'TRANSACTIONS_REMOVED': {
      const conn = await resolveConnection(itemId);
      if (!conn) return;
      const removedIds = body.removed_transactions || [];
      if (removedIds.length > 0) {
        await supabaseAdmin.from('transactions').delete().in('id', removedIds);
      }
      console.log(`[WEBHOOK] Removed ${removedIds.length} transactions for user ${conn.user_id}`);
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
  switch (code) {
    case 'ERROR': {
      console.error(`[WEBHOOK] Item error for ${itemId}:`, error);
      await supabaseAdmin.from('connections')
        .update({
          status: 'error',
          error_code: error?.error_code || 'UNKNOWN',
          error_detail: error?.error_message || '',
          remediation_hint: error?.error_code === 'ITEM_LOGIN_REQUIRED'
            ? 'Your bank requires re-authentication. Tap to reconnect.'
            : 'Please try again later.',
        })
        .eq('plaid_item_id', itemId);
      break;
    }
    case 'PENDING_EXPIRATION':
      console.warn(`[WEBHOOK] Item ${itemId} access token expiring soon`);
      await supabaseAdmin.from('connections')
        .update({ status: 'expiring_soon' })
        .eq('plaid_item_id', itemId);
      break;
    case 'USER_PERMISSION_REVOKED':
      console.warn(`[WEBHOOK] User revoked permissions for item ${itemId}`);
      // Cascade delete will clean up plaid_tokens via FK
      await supabaseAdmin.from('connections')
        .update({ status: 'revoked' })
        .eq('plaid_item_id', itemId);
      break;
    case 'NEW_ACCOUNTS_AVAILABLE':
      console.log(`[WEBHOOK] New accounts available for item ${itemId}`);
      break;
    default:
      console.log('[WEBHOOK] Unhandled ITEM code:', code);
  }
}

module.exports = router;
