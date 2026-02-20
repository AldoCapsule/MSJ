const express = require('express');
const router = express.Router();
const { PlaidApi, PlaidEnvironments, Configuration, Products, CountryCode } = require('plaid');
const { verifyFirebaseToken } = require('../middleware/auth');

// Initialize Plaid client
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

// All routes require auth
router.use(verifyFirebaseToken);

// ─────────────────────────────────────────────────────────────
// POST /plaid/create_link_token
// Creates a Plaid Link token for the authenticated user
// ─────────────────────────────────────────────────────────────
router.post('/create_link_token', async (req, res, next) => {
  try {
    const response = await plaidClient.linkTokenCreate({
      user: { client_user_id: req.uid },
      client_name: 'MansajeBudget',
      products: [Products.Transactions],
      country_codes: [CountryCode.Us],
      language: 'en',
      webhook: process.env.PLAID_WEBHOOK_URL,
    });

    res.json({ link_token: response.data.link_token });
  } catch (error) {
    console.error('[PLAID] create_link_token error:', error.response?.data || error.message);
    next({ status: 502, message: 'Failed to create link token' });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /plaid/exchange_public_token
// Exchanges a public token for an access token (server-side only)
// Body: { public_token, institution_id, institution_name }
// ─────────────────────────────────────────────────────────────
router.post('/exchange_public_token', async (req, res, next) => {
  const { public_token, institution_id, institution_name } = req.body;

  if (!public_token) {
    return res.status(400).json({ error: 'public_token is required' });
  }

  try {
    const response = await plaidClient.itemPublicTokenExchange({ public_token });
    const accessToken = response.data.access_token;
    const itemId = response.data.item_id;

    // NOTE: In production, encrypt the access token before storing.
    // Here we return it to the iOS app which stores it in Keychain.
    // Alternative: store encrypted in Firestore under users/{uid}/plaid_items/{itemId}
    res.json({
      access_token: accessToken,
      item_id: itemId,
      institution_id,
      institution_name,
    });
  } catch (error) {
    console.error('[PLAID] exchange_public_token error:', error.response?.data || error.message);
    next({ status: 502, message: 'Failed to exchange public token' });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /plaid/transactions/sync
// Syncs new/modified/removed transactions for an item
// Body: { access_token, cursor? }
// ─────────────────────────────────────────────────────────────
router.post('/transactions/sync', async (req, res, next) => {
  const { access_token, cursor } = req.body;

  if (!access_token) {
    return res.status(400).json({ error: 'access_token is required' });
  }

  try {
    let added = [];
    let modified = [];
    let removed = [];
    let nextCursor = cursor;
    let hasMore = true;

    while (hasMore) {
      const response = await plaidClient.transactionsSync({
        access_token,
        cursor: nextCursor,
        count: 500,
      });

      added = added.concat(response.data.added);
      modified = modified.concat(response.data.modified);
      removed = removed.concat(response.data.removed);
      nextCursor = response.data.next_cursor;
      hasMore = response.data.has_more;
    }

    res.json({ added, modified, removed, next_cursor: nextCursor });
  } catch (error) {
    console.error('[PLAID] transactions/sync error:', error.response?.data || error.message);
    next({ status: 502, message: 'Failed to sync transactions' });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /plaid/accounts
// Fetches accounts for an item
// Body: { access_token }
// ─────────────────────────────────────────────────────────────
router.post('/accounts', async (req, res, next) => {
  const { access_token } = req.body;

  if (!access_token) {
    return res.status(400).json({ error: 'access_token is required' });
  }

  try {
    const response = await plaidClient.accountsGet({ access_token });
    res.json({
      accounts: response.data.accounts,
      item: response.data.item,
    });
  } catch (error) {
    console.error('[PLAID] accounts error:', error.response?.data || error.message);
    next({ status: 502, message: 'Failed to fetch accounts' });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /plaid/balance
// Get real-time balances
// Body: { access_token }
// ─────────────────────────────────────────────────────────────
router.post('/balance', async (req, res, next) => {
  const { access_token } = req.body;

  if (!access_token) {
    return res.status(400).json({ error: 'access_token is required' });
  }

  try {
    const response = await plaidClient.accountsBalanceGet({ access_token });
    res.json({ accounts: response.data.accounts });
  } catch (error) {
    console.error('[PLAID] balance error:', error.response?.data || error.message);
    next({ status: 502, message: 'Failed to fetch balance' });
  }
});

module.exports = router;
