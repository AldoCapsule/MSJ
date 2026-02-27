'use strict';

/**
 * Plaid Webhook Signature Verification Middleware  (fixes CRIT-1)
 *
 * Plaid signs every webhook with an ES256 JWT in the `Plaid-Verification`
 * request header.  This middleware authenticates that header before any
 * handler code runs.
 *
 * Verification steps
 * ──────────────────
 *  1. Parse the three-part JWT from the `Plaid-Verification` header.
 *  2. Decode the JWT header (base64url) → extract `kid` and assert `alg = ES256`.
 *  3. Decode the JWT payload → check `exp` (not expired) and `iat` (≤ 5 min old).
 *  4. Fetch the matching JWK from Plaid via `webhookVerificationKeyGet`.
 *     The resulting `CryptoKey` is cached by `kid` until Plaid marks it expired.
 *  5. Verify the ES256 signature over `encodedHeader.encodedPayload` bytes.
 *  6. Hash the raw request body with SHA-256 and compare to
 *     `payload.request_body_sha256`.
 *
 * Fail-secure — any failure returns 400/401 and the handler never runs.
 *
 * Requirements
 * ────────────
 *  • Node.js ≥ 18  (for crypto.webcrypto.subtle — no extra packages needed)
 *  • express.json() must be configured with a `verify` callback that sets
 *    req.rawBody — see server.js.
 *
 * Plaid docs: https://plaid.com/docs/api/webhooks/webhook-verification/
 */

const { webcrypto: { subtle } } = require('crypto');
const crypto = require('crypto');

// ── Key cache ────────────────────────────────────────────────────────────────
// Stores imported CryptoKey objects (not raw JWKs) keyed by Plaid's `kid`.
// Importing a key is slow (elliptic-curve point validation); caching the
// ready-to-use CryptoKey means each subsequent request only pays for verify().
//
// Map<kid: string, { cryptoKey: CryptoKey, expiresAt: number (epoch ms) }>
const keyCache = new Map();

// Tokens older than this are rejected even if the signature is valid.
const MAX_TOKEN_AGE_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Retrieve a verified CryptoKey for the given kid.
 * Returns a cached entry if it hasn't expired, otherwise fetches fresh from
 * Plaid's key endpoint and re-imports.
 *
 * @param {import('plaid').PlaidApi} plaidClient
 * @param {string} kid
 * @returns {Promise<CryptoKey>}
 */
async function getCachedCryptoKey(plaidClient, kid) {
  const cached = keyCache.get(kid);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.cryptoKey;
  }

  // Cache miss or expired — fetch from Plaid
  const response = await plaidClient.webhookVerificationKeyGet({ key_id: kid });
  const jwk = response.data.key;

  const cryptoKey = await subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,       // non-extractable
    ['verify'],
  );

  // Plaid's `expired_at` is a Unix timestamp (seconds).  Fall back to 5 min.
  const expiresAt = jwk.expired_at
    ? jwk.expired_at * 1000
    : Date.now() + MAX_TOKEN_AGE_MS;

  keyCache.set(kid, { cryptoKey, expiresAt });
  return cryptoKey;
}

// ── Middleware factory ────────────────────────────────────────────────────────

/**
 * Returns an Express middleware that verifies the `Plaid-Verification` JWT
 * before allowing a webhook handler to run.
 *
 * Usage:
 *   const { verifyPlaidWebhook } = require('../middleware/plaidWebhookVerification');
 *   router.post('/plaid', verifyPlaidWebhook(plaidClient), handler);
 *
 * @param {import('plaid').PlaidApi} plaidClient  Shared Plaid API client
 * @returns {import('express').RequestHandler}
 */
function verifyPlaidWebhook(plaidClient) {
  return async function plaidWebhookVerificationMiddleware(req, res, next) {

    // ── Dev escape hatch ─────────────────────────────────────────────────────
    // Set PLAID_VERIFY_WEBHOOKS=false to skip verification when sending test
    // webhooks with curl / Postman.  Blocked unconditionally in production.
    if (process.env.PLAID_VERIFY_WEBHOOKS === 'false') {
      if (process.env.NODE_ENV === 'production') {
        console.error('[WEBHOOK] FATAL: PLAID_VERIFY_WEBHOOKS=false in production');
        return res.status(500).json({ error: 'Server misconfiguration' });
      }
      console.warn('[WEBHOOK] ⚠  Webhook verification disabled — dev mode only');
      return next();
    }

    // ── 1. Extract JWT ───────────────────────────────────────────────────────
    const token = req.headers['plaid-verification'];
    if (!token) {
      console.error('[WEBHOOK] Missing Plaid-Verification header');
      return res.status(400).json({ error: 'Missing Plaid-Verification header' });
    }

    const parts = token.split('.');
    if (parts.length !== 3) {
      console.error('[WEBHOOK] Malformed JWT in Plaid-Verification header');
      return res.status(401).json({ error: 'Malformed verification token' });
    }

    const [headerB64, payloadB64, signatureB64] = parts;

    try {
      // ── 2. Decode JWT header → kid + alg ──────────────────────────────────
      let jwtHeader;
      try {
        jwtHeader = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf8'));
      } catch {
        return res.status(401).json({ error: 'Cannot decode JWT header' });
      }

      const { kid, alg } = jwtHeader;

      if (!kid) {
        console.error('[WEBHOOK] JWT header missing kid');
        return res.status(401).json({ error: 'JWT header missing kid' });
      }

      // Plaid exclusively uses ES256.  Reject anything else to prevent
      // algorithm-confusion attacks (e.g. RS256 with a public key as secret).
      if (alg !== 'ES256') {
        console.error(`[WEBHOOK] Unexpected JWT algorithm: ${alg}`);
        return res.status(401).json({ error: `Unexpected JWT algorithm: ${alg}` });
      }

      // ── 3. Decode JWT payload ──────────────────────────────────────────────
      let payload;
      try {
        payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
      } catch {
        return res.status(401).json({ error: 'Cannot decode JWT payload' });
      }

      // ── 4a. Expiry check ───────────────────────────────────────────────────
      const nowSec = Math.floor(Date.now() / 1000);
      if (payload.exp && payload.exp < nowSec) {
        console.error(`[WEBHOOK] JWT expired (exp=${payload.exp} now=${nowSec})`);
        return res.status(401).json({ error: 'Verification token expired' });
      }

      // ── 4b. Replay-attack guard ────────────────────────────────────────────
      // Reject tokens issued more than 5 minutes ago even if the signature is
      // valid — prevents an attacker from replaying a legitimately captured JWT.
      if (payload.iat) {
        const tokenAgeMs = Date.now() - payload.iat * 1000;
        if (tokenAgeMs > MAX_TOKEN_AGE_MS) {
          console.error(`[WEBHOOK] JWT too old (age=${Math.round(tokenAgeMs / 1000)}s)`);
          return res.status(401).json({ error: 'Verification token too old' });
        }
      }

      // ── 5. Fetch / cache the JWK → CryptoKey ──────────────────────────────
      let cryptoKey;
      try {
        cryptoKey = await getCachedCryptoKey(plaidClient, kid);
      } catch (err) {
        console.error('[WEBHOOK] Key fetch failed:', err.message);
        return res.status(401).json({ error: 'Could not retrieve verification key' });
      }

      // ── 6. Verify ES256 signature ──────────────────────────────────────────
      // The signed message is exactly the string: encodedHeader + "." + encodedPayload
      const signedData = Buffer.from(`${headerB64}.${payloadB64}`);
      const signature  = Buffer.from(signatureB64, 'base64url');

      const signatureValid = await subtle.verify(
        { name: 'ECDSA', hash: 'SHA-256' },
        cryptoKey,
        signature,
        signedData,
      );

      if (!signatureValid) {
        console.error('[WEBHOOK] Invalid JWT signature — possible forgery');
        return res.status(401).json({ error: 'Invalid webhook signature' });
      }

      // ── 7. Verify request body hash ────────────────────────────────────────
      // req.rawBody is set by the `verify` callback in express.json() — see
      // server.js.  Failing here means server.js is misconfigured.
      if (!req.rawBody) {
        console.error('[WEBHOOK] req.rawBody not set — check express.json verify callback');
        return res.status(500).json({ error: 'Server configuration error' });
      }

      const bodyHash = crypto
        .createHash('sha256')
        .update(req.rawBody)
        .digest('hex');

      if (payload.request_body_sha256 !== bodyHash) {
        console.error('[WEBHOOK] Body hash mismatch — payload may be tampered');
        return res.status(401).json({ error: 'Request body hash mismatch' });
      }

      // ── All checks passed ──────────────────────────────────────────────────
      console.log(`[WEBHOOK] Signature verified (kid=${kid})`);
      next();

    } catch (err) {
      // Unexpected error — fail secure
      console.error('[WEBHOOK] Verification threw unexpectedly:', err.message);
      return res.status(401).json({ error: 'Webhook verification failed' });
    }
  };
}

module.exports = { verifyPlaidWebhook };
