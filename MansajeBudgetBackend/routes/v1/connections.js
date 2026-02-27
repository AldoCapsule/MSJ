'use strict';
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { PlaidApi, PlaidEnvironments, Configuration } = require('plaid');
const { verifyFirebaseToken } = require('../../middleware/auth');
const { supabaseForUser, supabaseAdmin } = require('../../db');

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
    const { data, error } = await supabaseForUser(req.accessToken)
      .from('connections')
      .select('id, user_id, institution_id, institution_name, plaid_item_id, auth_type, status, last_success_at, error_code, error_detail, requires_mfa, remediation_hint, consent_scopes, created_at, updated_at')
      .order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: 'Database error' });
    res.json({ connections: data });
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

    // 1. Upsert connection record
    const { data: conn, error: connErr } = await supabaseAdmin
      .from('connections')
      .upsert({
        id: uuidv4(),
        user_id: req.uid,
        institution_id: institution_id || null,
        institution_name: institution_name || 'Unknown',
        plaid_item_id: item_id,
        auth_type: 'oauth',
        status: 'active',
        last_success_at: new Date().toISOString(),
        error_code: null,
        error_detail: null,
        requires_mfa: false,
        remediation_hint: null,
        consent_scopes: consent_scopes || ['transactions'],
      }, { onConflict: 'plaid_item_id' })
      .select()
      .single();
    if (connErr) return res.status(500).json({ error: 'Database error' });

    // 2. Store encrypted token via DB function
    const { error: tokenErr } = await supabaseAdmin.rpc('store_plaid_token', {
      p_connection_id: conn.id,
      p_user_id: req.uid,
      p_token: access_token,
    });
    if (tokenErr) {
      console.error('[CONNECTIONS] store_plaid_token error:', tokenErr.message);
      return res.status(500).json({ error: 'Failed to store token' });
    }

    // 3. Grant consent record
    await supabaseAdmin.from('consent_grants').insert({
      id: uuidv4(),
      user_id: req.uid,
      connection_id: conn.id,
      scopes: consent_scopes || ['transactions'],
      granted_at: new Date().toISOString(),
      revoked_at: null,
    });

    res.status(201).json({ connection: conn, item_id });
  } catch (err) {
    console.error('[CONNECTIONS] POST error:', err.response?.data || err.message);
    next({ status: 502, message: 'Failed to create connection' });
  }
});

// POST /v1/connections/:id/refresh
router.post('/:id/refresh', async (req, res, next) => {
  try {
    const { data: conn, error: connErr } = await supabaseForUser(req.accessToken)
      .from('connections')
      .select('id, plaid_item_id, sync_cursor')
      .eq('id', req.params.id)
      .single();
    if (connErr?.code === 'PGRST116') return res.status(404).json({ error: 'Connection not found' });
    if (connErr) return res.status(500).json({ error: 'Database error' });

    const { data: accessToken, error: tokenErr } = await supabaseAdmin
      .rpc('get_plaid_token', { p_connection_id: conn.id });
    if (tokenErr || !accessToken) return res.status(404).json({ error: 'Token not found' });

    // Create a refresh job
    const jobId = uuidv4();
    await supabaseAdmin.from('refresh_jobs').insert({
      id: jobId,
      connection_id: req.params.id,
      user_id: req.uid,
      scheduled_at: new Date().toISOString(),
      started_at: new Date().toISOString(),
      status: 'running',
    });

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

    // Upsert added transactions
    if (added.length > 0) {
      await supabaseAdmin.from('transactions').upsert(
        added.map(txn => ({
          id: txn.transaction_id,
          user_id: req.uid,
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
    const removedIds = (removed || []).map(r => r.transaction_id).filter(Boolean);
    if (removedIds.length > 0) {
      await supabaseAdmin.from('transactions').delete().in('id', removedIds);
    }

    // Update refresh job
    await supabaseAdmin.from('refresh_jobs').update({
      status: 'completed',
      finished_at: new Date().toISOString(),
      transactions_added: added.length,
      transactions_modified: modified.length,
      transactions_removed: removed.length,
    }).eq('id', jobId);

    // Update connection cursor and status
    await supabaseAdmin.from('connections').update({
      sync_cursor: cursor,
      last_success_at: new Date().toISOString(),
      status: 'active',
      error_code: null,
    }).eq('id', req.params.id);

    res.json({
      job_id: jobId, added: added.length, modified: modified.length,
      removed: removed.length, next_cursor: cursor,
    });
  } catch (err) {
    console.error('[CONNECTIONS] refresh error:', err.response?.data || err.message);
    const errCode = err.response?.data?.error_code;
    await supabaseAdmin.from('connections').update({
      status: 'error',
      error_code: errCode || 'UNKNOWN',
      error_detail: err.message,
      remediation_hint: errCode === 'ITEM_LOGIN_REQUIRED'
        ? 'Re-authenticate your bank connection.' : 'Please try again later.',
    }).eq('id', req.params.id).catch(() => {});
    next({ status: 502, message: 'Failed to refresh connection' });
  }
});

// GET /v1/connections/:id/refresh-jobs
router.get('/:id/refresh-jobs', async (req, res, next) => {
  try {
    const { data, error } = await supabaseForUser(req.accessToken)
      .from('refresh_jobs')
      .select('*')
      .eq('connection_id', req.params.id)
      .order('scheduled_at', { ascending: false })
      .limit(20);
    if (error) return res.status(500).json({ error: 'Database error' });
    res.json({ jobs: data });
  } catch (err) {
    next({ status: 500, message: 'Failed to fetch refresh jobs' });
  }
});

// POST /v1/connections/:id/repair — initiate re-link flow
router.post('/:id/repair', async (req, res, next) => {
  try {
    const { data: conn, error: connErr } = await supabaseForUser(req.accessToken)
      .from('connections')
      .select('id')
      .eq('id', req.params.id)
      .single();
    if (connErr?.code === 'PGRST116') return res.status(404).json({ error: 'Connection not found' });
    if (connErr) return res.status(500).json({ error: 'Database error' });

    const { data: accessToken, error: tokenErr } = await supabaseAdmin
      .rpc('get_plaid_token', { p_connection_id: conn.id });
    if (tokenErr || !accessToken) return res.status(404).json({ error: 'Token not found' });

    const linkResponse = await plaidClient.linkTokenCreate({
      user: { client_user_id: req.uid },
      client_name: 'MansajeBudget',
      access_token: accessToken,
      language: 'en',
      country_codes: ['US'],
    });

    await supabaseAdmin.from('connections')
      .update({ status: 'repairing' })
      .eq('id', req.params.id);

    res.json({ link_token: linkResponse.data.link_token });
  } catch (err) {
    console.error('[CONNECTIONS] repair error:', err.response?.data || err.message);
    next({ status: 502, message: 'Failed to initiate repair' });
  }
});

module.exports = router;
