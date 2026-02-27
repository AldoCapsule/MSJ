# Firebase → Supabase Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Migrate MansajeBudget from Firebase Auth + Firestore to Supabase Auth + Postgres across backend (Node.js), iOS (SwiftUI), and web (Next.js 14), and add a full Wealth Management plugin.

**Architecture:** Big Bang cutover — greenfield, no live data. Supabase Postgres replaces all 14 Firestore collections with relational tables + RLS. The Node.js backend becomes the single data layer (service_role client); iOS and web use anon key + user JWT. Plaid tokens are encrypted at rest via pgcrypto (fixes CRIT-2). Transaction primary key = `plaid_transaction_id` (fixes HIGH-4).

**Tech Stack:** Node.js 18+ / Express, `@supabase/supabase-js` v2, `supabase-swift` (iOS SPM), Next.js 14 App Router, `@supabase/ssr`, Recharts, Framer Motion, Tailwind CSS.

**Design doc:** `docs/plans/2026-02-27-supabase-migration-design.md`

---

## Phase 1 — Supabase Project Setup

### Task 1: Create Supabase project

**Steps:**

1. Go to https://supabase.com → New project. Note the **Project Ref**, **URL**, **anon key**, and **service_role key**.

2. In Supabase Dashboard → **Database → Extensions**, enable:
   ```sql
   create extension if not exists "pgcrypto";
   ```

3. In **Authentication → Providers**, enable:
   - **Apple** — paste Apple Service ID + Team ID + Key ID + `.p8` private key
   - **Google** — paste OAuth client ID + client secret (from Google Cloud Console)

4. Commit nothing — this is dashboard config only.

---

### Task 2: Run SQL schema migrations

**Files:**
- Create: `MansajeBudgetBackend/supabase/migrations/001_initial_schema.sql`

**Step 1: Write migration file**

```sql
-- 001_initial_schema.sql

-- ── Users ───────────────────────────────────────────────────────
create table users (
  id uuid primary key references auth.users on delete cascade,
  display_name text,
  created_at timestamptz default now()
);
alter table users enable row level security;
create policy "users own their row" on users for all
  using (auth.uid() = id) with check (auth.uid() = id);

-- Auto-create user row on signup
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into users (id, display_name)
  values (new.id, new.raw_user_meta_data->>'full_name');
  return new;
end;
$$;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- ── Accounts ────────────────────────────────────────────────────
create table accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users on delete cascade,
  plaid_account_id text unique,
  name text not null,
  type text not null check (type in ('checking','savings','credit','investment','loan','other')),
  institution_name text,
  mask text,
  current_balance numeric(12,2),
  available_balance numeric(12,2),
  is_hidden boolean default false,
  created_at timestamptz default now()
);
alter table accounts enable row level security;
create policy "users own their accounts" on accounts for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index on accounts(user_id);

-- ── Connections (Plaid items) ────────────────────────────────────
create table connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users on delete cascade,
  plaid_item_id text not null unique,
  institution_name text,
  status text default 'active' check (status in ('active','error','expiring_soon','revoked')),
  error_code text,
  remediation_hint text,
  sync_cursor text,
  last_success_at timestamptz,
  created_at timestamptz default now()
);
alter table connections enable row level security;
create policy "users own their connections" on connections for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index on connections(user_id);
create index on connections(plaid_item_id);

-- ── Plaid tokens (server-only — NO client policy) ────────────────
create table plaid_tokens (
  connection_id uuid primary key references connections on delete cascade,
  user_id uuid not null references users on delete cascade,
  access_token_encrypted text not null
);
alter table plaid_tokens enable row level security;
-- Intentionally no policy → total client deny

-- ── Transactions ─────────────────────────────────────────────────
create table transactions (
  id text primary key,
  user_id uuid not null references users on delete cascade,
  account_id uuid references accounts on delete set null,
  name text not null,
  amount numeric(12,2) not null,
  date date not null,
  category text default 'other',
  is_pending boolean default false,
  is_manual boolean default false,
  is_hidden boolean default false,
  is_transfer boolean default false,
  review_status text default 'unreviewed'
    check (review_status in ('unreviewed','reviewed','flagged')),
  notes text,
  tags text[],
  last_synced_at timestamptz,
  created_at timestamptz default now()
);
alter table transactions enable row level security;
create policy "users own their transactions" on transactions for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index on transactions(user_id, date desc);
create index on transactions(account_id);

-- ── Categories ───────────────────────────────────────────────────
create table categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users on delete cascade,
  name text not null,
  icon text,
  color text,
  parent_id uuid references categories(id),
  is_system boolean default false,
  created_at timestamptz default now()
);
alter table categories enable row level security;
create policy "users own their categories" on categories for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── Budgets ──────────────────────────────────────────────────────
create table budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users on delete cascade,
  category text not null,
  amount_limit numeric(12,2) not null check (amount_limit > 0),
  month int check (month between 1 and 12),
  year int,
  created_at timestamptz default now()
);
alter table budgets enable row level security;
create policy "users own their budgets" on budgets for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index on budgets(user_id);

-- ── Goals ────────────────────────────────────────────────────────
create table goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users on delete cascade,
  name text not null,
  target_amount numeric(12,2) not null,
  current_amount numeric(12,2) default 0,
  target_date date,
  is_completed boolean default false,
  created_at timestamptz default now()
);
alter table goals enable row level security;
create policy "users own their goals" on goals for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── Goal milestones ───────────────────────────────────────────────
create table goal_milestones (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references goals on delete cascade,
  user_id uuid not null references users on delete cascade,
  name text not null,
  target_amount numeric(12,2) not null,
  is_completed boolean default false,
  completed_at timestamptz,
  created_at timestamptz default now()
);
alter table goal_milestones enable row level security;
create policy "users own their milestones" on goal_milestones for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── Alerts ───────────────────────────────────────────────────────
create table alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users on delete cascade,
  type text not null,
  threshold numeric(12,2),
  category text,
  is_active boolean default true,
  created_at timestamptz default now()
);
alter table alerts enable row level security;
create policy "users own their alerts" on alerts for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── Alert events ─────────────────────────────────────────────────
create table alert_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users on delete cascade,
  alert_id uuid references alerts on delete cascade,
  fired_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  detail jsonb
);
alter table alert_events enable row level security;
create policy "users own their alert events" on alert_events for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── Investments ──────────────────────────────────────────────────
create table investments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users on delete cascade,
  account_id uuid references accounts on delete cascade,
  security_id text,
  name text,
  ticker text,
  quantity numeric(18,8),
  cost_basis numeric(12,2),
  institution_value numeric(12,2),
  currency text default 'USD',
  updated_at timestamptz default now()
);
alter table investments enable row level security;
create policy "users own their investments" on investments for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── Recurring streams ─────────────────────────────────────────────
create table recurring_streams (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users on delete cascade,
  account_id uuid references accounts on delete set null,
  name text not null,
  amount numeric(12,2),
  frequency text,
  category text,
  is_active boolean default true,
  last_date date,
  next_date date,
  created_at timestamptz default now()
);
alter table recurring_streams enable row level security;
create policy "users own their recurring streams" on recurring_streams for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── Rules ────────────────────────────────────────────────────────
create table rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users on delete cascade,
  match_field text not null,
  match_value text not null,
  action_category text,
  action_tags text[],
  priority int default 0,
  created_at timestamptz default now()
);
alter table rules enable row level security;
create policy "users own their rules" on rules for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── Insights ─────────────────────────────────────────────────────
create table insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users on delete cascade,
  month int not null,
  year int not null,
  content text not null,
  model text,
  created_at timestamptz default now(),
  unique(user_id, month, year)
);
alter table insights enable row level security;
create policy "users own their insights" on insights for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── Net worth snapshots ───────────────────────────────────────────
create table net_worth_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users on delete cascade,
  total_assets numeric(12,2) not null,
  total_liabilities numeric(12,2) not null,
  net_worth numeric(12,2) generated always as (total_assets - total_liabilities) stored,
  snapshot_date date not null,
  unique(user_id, snapshot_date)
);
alter table net_worth_snapshots enable row level security;
create policy "users own their snapshots" on net_worth_snapshots for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── Retirement projections ────────────────────────────────────────
create table retirement_projections (
  user_id uuid primary key references users on delete cascade,
  current_age int not null,
  retirement_age int not null,
  current_savings numeric(12,2) default 0,
  monthly_contribution numeric(12,2) default 0,
  expected_annual_return numeric(5,4) default 0.07,
  target_amount numeric(12,2),
  updated_at timestamptz default now()
);
alter table retirement_projections enable row level security;
create policy "users own their projection" on retirement_projections for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

**Step 2: Run in Supabase SQL editor**

Paste full contents into Supabase Dashboard → SQL Editor → Run.
Expected: all statements succeed with no errors.

**Step 3: Verify in Table Editor**

Open Supabase Dashboard → Table Editor. Confirm all 17 tables are visible.

**Step 4: Commit**

```bash
git add MansajeBudgetBackend/supabase/migrations/001_initial_schema.sql
git commit -m "feat(db): add Supabase Postgres schema with RLS + wealth tables"
```

---

## Phase 2 — Backend Migration

### Task 3: Install dependencies + create Supabase client module

**Files:**
- Modify: `MansajeBudgetBackend/package.json`
- Create: `MansajeBudgetBackend/db.js`
- Modify: `MansajeBudgetBackend/.env.example`

**Step 1: Install + remove packages**

```bash
cd MansajeBudgetBackend
npm install @supabase/supabase-js
npm uninstall firebase-admin
```

**Step 2: Write `db.js`**

```javascript
'use strict';
const { createClient } = require('@supabase/supabase-js');

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
}

// service_role: bypasses RLS — use only in server-side handlers
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// User-scoped: RLS enforced via the caller's JWT
const supabaseForUser = (accessToken) =>
  createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });

module.exports = { supabaseAdmin, supabaseForUser };
```

**Step 3: Update `.env.example`**

Add below the existing Plaid block:
```bash
# ── Supabase ───────────────────────────────────────────────────
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# Plaid token encryption (pgp_sym_encrypt passphrase — keep secret)
PLAID_TOKEN_ENCRYPTION_KEY=replace_with_32_random_bytes_hex
```

Remove the `FIREBASE_SERVICE_ACCOUNT_PATH` and `FIREBASE_PROJECT_ID` lines.

**Step 4: Commit**

```bash
git add MansajeBudgetBackend/db.js MansajeBudgetBackend/package.json \
        MansajeBudgetBackend/package-lock.json MansajeBudgetBackend/.env.example
git commit -m "feat(backend): add Supabase client module, remove firebase-admin"
```

---

### Task 4: Migrate auth middleware

**Files:**
- Modify: `MansajeBudgetBackend/middleware/auth.js`

**Step 1: Rewrite `middleware/auth.js`**

```javascript
'use strict';
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function verifySupabaseToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing Authorization header' });
  }
  const token = authHeader.slice(7);
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
  req.uid = user.id;
  req.accessToken = token;
  next();
}

module.exports = { verifyFirebaseToken: verifySupabaseToken }; // alias keeps all routes unchanged
```

> Note: Exporting as `verifyFirebaseToken` means all 13 route files that `require` it need zero changes for the auth import.

**Step 2: Commit**

```bash
git add MansajeBudgetBackend/middleware/auth.js
git commit -m "fix(auth): replace Firebase token verification with Supabase"
```

---

### Task 5: Migrate transactions route

**Files:**
- Modify: `MansajeBudgetBackend/routes/v1/transactions.js`

**Step 1: Replace all `admin.firestore()` calls**

Key translation reference:
```javascript
// At top of file — remove firebase imports, add:
const { supabaseForUser, supabaseAdmin } = require('../../db');

// GET list
const { data, error } = await supabaseForUser(req.accessToken)
  .from('transactions')
  .select('*')
  .order('date', { ascending: false })
  .limit(limit)
  .range(offset, offset + limit - 1);

// GET single
const { data, error } = await supabaseForUser(req.accessToken)
  .from('transactions')
  .select('*')
  .eq('id', req.params.id)
  .single();

// POST (manual transaction)
const { data, error } = await supabaseForUser(req.accessToken)
  .from('transactions')
  .insert({ ...body, user_id: req.uid, id: require('uuid').v4() })
  .select()
  .single();

// PATCH
const { data, error } = await supabaseForUser(req.accessToken)
  .from('transactions')
  .update(updates)
  .eq('id', req.params.id)
  .select()
  .single();

// DELETE
const { error } = await supabaseForUser(req.accessToken)
  .from('transactions')
  .delete()
  .eq('id', req.params.id);

// Bulk PATCH
const { error } = await supabaseForUser(req.accessToken)
  .from('transactions')
  .update(updates)
  .in('id', ids);
```

Replace error handling pattern:
```javascript
// BEFORE
if (!doc.exists) return res.status(404).json({ error: 'Not found' });

// AFTER
if (error?.code === 'PGRST116') return res.status(404).json({ error: 'Not found' });
if (error) return res.status(500).json({ error: 'Database error' });
```

**Step 2: Commit**

```bash
git add MansajeBudgetBackend/routes/v1/transactions.js
git commit -m "feat(backend): migrate transactions route to Supabase"
```

---

### Task 6: Migrate remaining v1 routes

**Files (migrate each the same way as Task 5):**
- `MansajeBudgetBackend/routes/v1/accounts.js`
- `MansajeBudgetBackend/routes/v1/budgets.js`
- `MansajeBudgetBackend/routes/v1/categories.js`
- `MansajeBudgetBackend/routes/v1/goals.js`
- `MansajeBudgetBackend/routes/v1/alerts.js`
- `MansajeBudgetBackend/routes/v1/reports.js`
- `MansajeBudgetBackend/routes/v1/exports.js`
- `MansajeBudgetBackend/routes/v1/insights.js`
- `MansajeBudgetBackend/routes/v1/investments.js`
- `MansajeBudgetBackend/routes/v1/recurring.js`
- `MansajeBudgetBackend/routes/v1/rules.js`

**Pattern for each file:**

1. Remove `const admin = require('firebase-admin')` and `const db = () => admin.firestore()`
2. Add `const { supabaseForUser } = require('../../db')`
3. Replace every `.collection('users').doc(uid).collection('<table>')` chain with `.from('<table>')`
4. Replace `.get()` → `.select('*')`; `.set()` → `.insert()`; `.update()` → `.update()`; `.delete()` → `.delete()`
5. Replace `snap.docs.map(d => d.data())` → `data` (direct array)
6. Replace `doc.exists` check → `error?.code === 'PGRST116'`

**Special case — `connections.js` (Plaid token encryption):**

```javascript
// Store encrypted token (fixes CRIT-2)
const { supabaseAdmin } = require('../../db');

// After exchange_token:
await supabaseAdmin.from('plaid_tokens').upsert({
  connection_id: connectionId,
  user_id: req.uid,
  access_token_encrypted: `pgp_sym_encrypt('${accessToken}', '${process.env.PLAID_TOKEN_ENCRYPTION_KEY}')`,
});

// Retrieve token — use raw SQL for decryption
const { data } = await supabaseAdmin.rpc('get_plaid_token', {
  p_connection_id: connectionId,
  p_key: process.env.PLAID_TOKEN_ENCRYPTION_KEY,
});
```

Add this SQL function in a new migration file `002_plaid_token_decrypt.sql`:
```sql
create or replace function get_plaid_token(p_connection_id uuid, p_key text)
returns text language sql security definer as $$
  select pgp_sym_decrypt(access_token_encrypted::bytea, p_key)
  from plaid_tokens
  where connection_id = p_connection_id;
$$;
```

**Special case — `exports.js` (add row limit to fix DoS vector):**

```javascript
// Cap export at 10,000 rows
const { data, error } = await supabaseForUser(req.accessToken)
  .from('transactions')
  .select('*')
  .order('date', { ascending: false })
  .limit(10000); // was unbounded
```

**Step after each file: Commit**

```bash
git add MansajeBudgetBackend/routes/v1/<filename>.js
git commit -m "feat(backend): migrate <name> route to Supabase"
```

---

### Task 7: Migrate webhook handler

**Files:**
- Modify: `MansajeBudgetBackend/routes/webhooks.js`

**Step 1: Replace Plaid client construction + Firestore with Supabase**

```javascript
// Remove: const admin = require('firebase-admin'); const db = () => admin.firestore();
// Add:
const { supabaseAdmin } = require('../db');

// resolveUid — replace plaid_item_index Firestore collection
async function resolveConnection(itemId) {
  const { data, error } = await supabaseAdmin
    .from('connections')
    .select('id, user_id, sync_cursor')
    .eq('plaid_item_id', itemId)
    .single();
  if (error || !data) return null;
  return data;
}

// SYNC_UPDATES_AVAILABLE — retrieve encrypted token
const { data: tokenRow } = await supabaseAdmin
  .rpc('get_plaid_token', {
    p_connection_id: conn.id,
    p_key: process.env.PLAID_TOKEN_ENCRYPTION_KEY,
  });
const access_token = tokenRow;

// Upsert transactions (idempotent — plaid_transaction_id is PK)
await supabaseAdmin.from('transactions').upsert(
  added.map(txn => ({
    id: txn.transaction_id,
    user_id: conn.user_id,
    name: txn.name,
    amount: txn.amount,
    date: txn.date || txn.authorized_date,
    account_id: null, // resolved in next step if needed
    category: txn.category?.[0] || 'other',
    is_pending: txn.pending || false,
    is_manual: false,
    last_synced_at: new Date().toISOString(),
  })),
  { onConflict: 'id' }
);

// Delete removed transactions
if (removed.length > 0) {
  await supabaseAdmin.from('transactions')
    .delete()
    .in('id', removed.map(r => r.transaction_id).filter(Boolean));
}

// Update sync cursor
await supabaseAdmin.from('connections')
  .update({ sync_cursor: cursor, last_success_at: new Date().toISOString() })
  .eq('id', conn.id);
```

**Step 2: Commit**

```bash
git add MansajeBudgetBackend/routes/webhooks.js
git commit -m "feat(backend): migrate webhook handler to Supabase"
```

---

### Task 8: Add Wealth Management routes

**Files:**
- Create: `MansajeBudgetBackend/routes/v1/wealth.js`
- Modify: `MansajeBudgetBackend/server.js`

**Step 1: Create `routes/v1/wealth.js`**

```javascript
'use strict';
const express = require('express');
const router = express.Router();
const { verifyFirebaseToken } = require('../../middleware/auth');
const { supabaseForUser, supabaseAdmin } = require('../../db');
const { PlaidApi, PlaidEnvironments, Configuration } = require('plaid');

const plaidClient = new PlaidApi(new Configuration({
  basePath: PlaidEnvironments[process.env.PLAID_ENV || 'sandbox'],
  baseOptions: { headers: {
    'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
    'PLAID-SECRET': process.env.PLAID_SECRET,
  }},
}));

// GET /v1/wealth/net-worth — live calculation from accounts
router.get('/net-worth', verifyFirebaseToken, async (req, res) => {
  const { data: accounts, error } = await supabaseForUser(req.accessToken)
    .from('accounts')
    .select('type, current_balance')
    .eq('is_hidden', false);
  if (error) return res.status(500).json({ error: 'Database error' });

  const assets = accounts
    .filter(a => ['checking','savings','investment'].includes(a.type))
    .reduce((s, a) => s + (a.current_balance || 0), 0);
  const liabilities = accounts
    .filter(a => ['credit','loan'].includes(a.type))
    .reduce((s, a) => s + (a.current_balance || 0), 0);

  res.json({ assets, liabilities, net_worth: assets - liabilities });
});

// GET /v1/wealth/net-worth/history
router.get('/net-worth/history', verifyFirebaseToken, async (req, res) => {
  const { data, error } = await supabaseForUser(req.accessToken)
    .from('net_worth_snapshots')
    .select('snapshot_date, net_worth, total_assets, total_liabilities')
    .order('snapshot_date', { ascending: true })
    .limit(365);
  if (error) return res.status(500).json({ error: 'Database error' });
  res.json(data);
});

// GET /v1/wealth/portfolio — Plaid investments holdings
router.get('/portfolio', verifyFirebaseToken, async (req, res) => {
  const { data: connections } = await supabaseForUser(req.accessToken)
    .from('connections').select('id').eq('status', 'active');
  if (!connections?.length) return res.json({ holdings: [], securities: [] });

  const allHoldings = [], allSecurities = [];
  for (const conn of connections) {
    const token = await supabaseAdmin.rpc('get_plaid_token', {
      p_connection_id: conn.id,
      p_key: process.env.PLAID_TOKEN_ENCRYPTION_KEY,
    });
    if (!token.data) continue;
    try {
      const resp = await plaidClient.investmentsHoldingsGet({ access_token: token.data });
      allHoldings.push(...resp.data.holdings);
      allSecurities.push(...resp.data.securities);
    } catch (_) { /* skip connections without investment data */ }
  }
  res.json({ holdings: allHoldings, securities: allSecurities });
});

// GET /v1/wealth/retirement
router.get('/retirement', verifyFirebaseToken, async (req, res) => {
  const { data, error } = await supabaseForUser(req.accessToken)
    .from('retirement_projections')
    .select('*')
    .eq('user_id', req.uid)
    .maybeSingle();
  if (error) return res.status(500).json({ error: 'Database error' });
  if (!data) return res.json(null);

  // Compound growth projection: FV = PV*(1+r)^n + PMT*[((1+r)^n - 1)/r]
  const years = data.retirement_age - data.current_age;
  const r = data.expected_annual_return / 12;
  const n = years * 12;
  const pv = Number(data.current_savings);
  const pmt = Number(data.monthly_contribution);
  const projected = pv * Math.pow(1 + r, n) + pmt * ((Math.pow(1 + r, n) - 1) / r);

  res.json({ ...data, projected_amount: Math.round(projected) });
});

// PUT /v1/wealth/retirement
router.put('/retirement', verifyFirebaseToken, async (req, res) => {
  const { current_age, retirement_age, current_savings, monthly_contribution,
          expected_annual_return, target_amount } = req.body;
  const { data, error } = await supabaseForUser(req.accessToken)
    .from('retirement_projections')
    .upsert({ user_id: req.uid, current_age, retirement_age, current_savings,
              monthly_contribution, expected_annual_return, target_amount,
              updated_at: new Date().toISOString() })
    .select().single();
  if (error) return res.status(500).json({ error: 'Database error' });
  res.json(data);
});

// GET /v1/goals/:id/milestones
router.get('/:goalId/milestones', verifyFirebaseToken, async (req, res) => {
  const { data, error } = await supabaseForUser(req.accessToken)
    .from('goal_milestones')
    .select('*')
    .eq('goal_id', req.params.goalId)
    .order('target_amount', { ascending: true });
  if (error) return res.status(500).json({ error: 'Database error' });
  res.json(data);
});

// POST /v1/goals/:goalId/milestones
router.post('/:goalId/milestones', verifyFirebaseToken, async (req, res) => {
  const { name, target_amount } = req.body;
  const { data, error } = await supabaseForUser(req.accessToken)
    .from('goal_milestones')
    .insert({ goal_id: req.params.goalId, user_id: req.uid, name, target_amount })
    .select().single();
  if (error) return res.status(500).json({ error: 'Database error' });
  res.status(201).json(data);
});

// PATCH /v1/goals/:goalId/milestones/:id
router.patch('/:goalId/milestones/:id', verifyFirebaseToken, async (req, res) => {
  const updates = {};
  if (req.body.is_completed !== undefined) {
    updates.is_completed = req.body.is_completed;
    updates.completed_at = req.body.is_completed ? new Date().toISOString() : null;
  }
  if (req.body.name) updates.name = req.body.name;
  const { data, error } = await supabaseForUser(req.accessToken)
    .from('goal_milestones')
    .update(updates)
    .eq('id', req.params.id)
    .select().single();
  if (error) return res.status(500).json({ error: 'Database error' });
  res.json(data);
});

// DELETE /v1/goals/:goalId/milestones/:id
router.delete('/:goalId/milestones/:id', verifyFirebaseToken, async (req, res) => {
  const { error } = await supabaseForUser(req.accessToken)
    .from('goal_milestones')
    .delete()
    .eq('id', req.params.id);
  if (error) return res.status(500).json({ error: 'Database error' });
  res.status(204).end();
});

module.exports = router;
```

**Step 2: Register routes in `server.js`**

```javascript
// Add after existing v1 routes:
app.use('/v1/wealth',        require('./routes/v1/wealth'));
app.use('/v1/goals',         require('./routes/v1/goals'));  // ensure goals route exists
```

**Step 3: Commit**

```bash
git add MansajeBudgetBackend/routes/v1/wealth.js MansajeBudgetBackend/server.js
git commit -m "feat(backend): add wealth management routes (net worth, portfolio, retirement, milestones)"
```

---

### Task 9: Update server.js + remove legacy Firebase code

**Files:**
- Modify: `MansajeBudgetBackend/server.js`

**Step 1: Replace Firebase Admin initialization block**

```javascript
// REMOVE this entire block:
const admin = require('firebase-admin');
const serviceAccount = ...;
admin.initializeApp(...);

// server.js now only needs:
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { generalLimiter } = require('./middleware/rateLimiter');
// db.js validates SUPABASE_URL on require — fail-fast at startup
require('./db');
```

**Step 2: Commit**

```bash
git add MansajeBudgetBackend/server.js
git commit -m "feat(backend): remove Firebase Admin initialization from server.js"
```

---

## Phase 3 — iOS Migration

### Task 10: Add supabase-swift via Swift Package Manager

**Step 1: Open Xcode → File → Add Package Dependencies**

URL: `https://github.com/supabase/supabase-swift`
Version: Up to Next Major, starting from `2.0.0`

Products to add to target: `Supabase`, `Auth`, `Realtime`, `PostgREST`

**Step 2: Remove Firebase packages**

Xcode → Project → Package Dependencies → remove:
- `firebase-ios-sdk`
- `GoogleSignIn-iOS`

**Step 3: Delete `GoogleService-Info.plist`**

**Step 4: Commit**

```bash
git add MansajeBudget.xcodeproj/project.pbxproj
git commit -m "feat(ios): replace Firebase SDK with supabase-swift"
```

---

### Task 11: Create Supabase client singleton

**Files:**
- Create: `MansajeBudget/Services/SupabaseClientService.swift`

**Step 1: Write file**

```swift
import Supabase
import Foundation

// Single shared client — access via SupabaseClientService.shared
final class SupabaseClientService {
    static let shared = SupabaseClientService()

    let client: SupabaseClient

    private init() {
        client = SupabaseClient(
            supabaseURL: URL(string: Secrets.supabaseURL)!,
            supabaseKey: Secrets.supabaseAnonKey
        )
    }
}

// Convenience accessor
var supabase: SupabaseClient { SupabaseClientService.shared.client }
```

**Step 2: Add `Secrets.swift` (loaded from .xcconfig)**

```swift
// MansajeBudget/Utilities/Secrets.swift
import Foundation

enum Secrets {
    static let supabaseURL    = Bundle.main.infoDictionary?["SUPABASE_URL"] as? String ?? ""
    static let supabaseAnonKey = Bundle.main.infoDictionary?["SUPABASE_ANON_KEY"] as? String ?? ""
    static let backendURL     = Bundle.main.infoDictionary?["BACKEND_URL"] as? String ?? ""
}
```

**Step 3: Add to `Debug.xcconfig` and `Release.xcconfig`**

```
SUPABASE_URL = https://$(SUPABASE_PROJECT_REF).supabase.co
SUPABASE_ANON_KEY = your_anon_key
BACKEND_URL = https://your-backend.com
```

**Step 4: Update `Constants.swift` (fixes HIGH-3)**

```swift
// Replace placeholder with Secrets reference
static let baseURL = Secrets.backendURL
```

**Step 5: Commit**

```bash
git add MansajeBudget/Services/SupabaseClientService.swift \
        MansajeBudget/Utilities/Secrets.swift \
        MansajeBudget/Utilities/Constants.swift
git commit -m "fix(ios): add Supabase client singleton, fix baseURL placeholder (HIGH-3)"
```

---

### Task 12: Rewrite AuthService.swift

**Files:**
- Modify: `MansajeBudget/Services/AuthService.swift`

**Step 1: Rewrite**

```swift
import Supabase
import AuthenticationServices
import CryptoKit

@MainActor
final class AuthService: ObservableObject {
    @Published var isAuthenticated = false
    @Published var currentUser: User?

    private var authStateTask: Task<Void, Never>?

    init() {
        authStateTask = Task {
            for await (event, session) in supabase.auth.authStateChanges {
                isAuthenticated = session != nil
                currentUser = session?.user
            }
        }
    }

    deinit { authStateTask?.cancel() }

    // Apple Sign In — nonce generation is identical to Firebase version
    func signInWithApple(idToken: String, nonce: String) async throws {
        try await supabase.auth.signInWithIdToken(
            credentials: .init(provider: .apple, idToken: idToken, nonce: nonce)
        )
    }

    func signInWithGoogle(idToken: String, accessToken: String) async throws {
        try await supabase.auth.signInWithIdToken(
            credentials: .init(provider: .google, idToken: idToken, accessToken: accessToken)
        )
    }

    func signOut() async throws {
        try await supabase.auth.signOut()
    }

    // JWT for backend API calls (replaces getIDToken())
    func currentToken() async throws -> String {
        try await supabase.auth.session.accessToken
    }

    // SHA256 nonce helper — unchanged from Firebase version
    func randomNonceString(length: Int = 32) -> String {
        var randomBytes = [UInt8](repeating: 0, count: length)
        _ = SecRandomCopyBytes(kSecRandomDefault, randomBytes.count, &randomBytes)
        return randomBytes.map { String(format: "%02hhx", $0) }.joined()
    }

    func sha256(_ input: String) -> String {
        let data = Data(input.utf8)
        let hash = SHA256.hash(data: data)
        return hash.map { String(format: "%02x", $0) }.joined()
    }
}
```

**Step 2: Commit**

```bash
git add MansajeBudget/Services/AuthService.swift
git commit -m "feat(ios): migrate AuthService to Supabase Auth"
```

---

### Task 13: Create SupabaseService (replaces FirestoreService)

**Files:**
- Create: `MansajeBudget/Services/SupabaseService.swift`
- Delete: `MansajeBudget/Services/FirestoreService.swift` (after all ViewModels updated)

**Step 1: Write SupabaseService.swift**

```swift
import Supabase
import Foundation

// All database operations. ViewModels call these methods.
// Real-time listeners use Supabase Realtime channels.
final class SupabaseService {
    static let shared = SupabaseService()

    // ── Transactions ────────────────────────────────────────────
    func fetchTransactions(limit: Int = 50) async throws -> [Transaction] {
        try await supabase
            .from("transactions")
            .select()
            .order("date", ascending: false)
            .limit(limit)
            .execute()
            .value
    }

    func observeTransactions(onChange: @escaping ([Transaction]) -> Void) -> RealtimeChannelV2 {
        let uid = supabase.auth.currentUser?.id.uuidString ?? ""
        let channel = supabase.realtimeV2.channel("transactions:\(uid)")
        Task {
            await channel.onPostgresChanges(AnyAction.self, table: "transactions") { _ in
                Task {
                    let txns = (try? await self.fetchTransactions()) ?? []
                    await MainActor.run { onChange(txns) }
                }
            }.subscribe()
        }
        return channel
    }

    // ── Accounts ────────────────────────────────────────────────
    func fetchAccounts() async throws -> [Account] {
        try await supabase.from("accounts").select().execute().value
    }

    // ── Budgets ─────────────────────────────────────────────────
    func fetchBudgets(month: Int, year: Int) async throws -> [Budget] {
        try await supabase
            .from("budgets")
            .select()
            .eq("month", value: month)
            .eq("year", value: year)
            .execute()
            .value
    }

    // ── Goals ───────────────────────────────────────────────────
    func fetchGoals() async throws -> [Goal] {
        try await supabase.from("goals").select().execute().value
    }

    func fetchMilestones(goalId: UUID) async throws -> [GoalMilestone] {
        try await supabase
            .from("goal_milestones")
            .select()
            .eq("goal_id", value: goalId.uuidString)
            .order("target_amount", ascending: true)
            .execute()
            .value
    }

    // (Add fetchCategories, fetchAlerts, fetchRecurring, fetchInsights
    //  following the same pattern)
}
```

**Step 2: Commit**

```bash
git add MansajeBudget/Services/SupabaseService.swift
git commit -m "feat(ios): add SupabaseService replacing FirestoreService"
```

---

### Task 14: Update all ViewModels

**Files (update each one):**
- `MansajeBudget/ViewModels/DashboardViewModel.swift`
- `MansajeBudget/ViewModels/TransactionsViewModel.swift`
- `MansajeBudget/ViewModels/AccountsViewModel.swift`
- `MansajeBudget/ViewModels/BudgetViewModel.swift`
- `MansajeBudget/ViewModels/InvestmentsViewModel.swift`
- `MansajeBudget/ViewModels/ReportsViewModel.swift`
- `MansajeBudget/ViewModels/AuthViewModel.swift`

**Pattern for each:**

```swift
// REMOVE: import FirebaseFirestore, import FirebaseAuth
// ADD: import Supabase

// REMOVE: private let db = Firestore.firestore()
// ADD: private let service = SupabaseService.shared

// REPLACE: FirestoreService.shared.fetchTransactions()
// WITH:    try await service.fetchTransactions()

// REPLACE: Firestore listener
// WITH:    Supabase Realtime channel (see SupabaseService.observeTransactions)

// FIX (HIGH-5): Timestamp cast is gone — all dates are now native Swift Date
// No more: data["fired_at"] as? Date — just use the Codable model directly
```

**For `DashboardViewModel` specifically — fix listener leak (MED-3):**

```swift
private var realtimeChannel: RealtimeChannelV2?

func load() async {
    // Cancel existing channel before creating new one
    if let existing = realtimeChannel {
        await existing.unsubscribe()
    }
    realtimeChannel = service.observeTransactions { [weak self] txns in
        self?.recentTransactions = Array(txns.prefix(5))
    }
    // load other data...
}
```

**Step after each file: Commit**

```bash
git add MansajeBudget/ViewModels/<filename>.swift
git commit -m "feat(ios): migrate <name>ViewModel to Supabase"
```

---

### Task 15: Add Wealth Management screens (iOS)

**Files:**
- Create: `MansajeBudget/ViewModels/WealthViewModel.swift`
- Create: `MansajeBudget/ViewModels/RetirementViewModel.swift`
- Create: `MansajeBudget/Views/WealthDashboardView.swift`
- Create: `MansajeBudget/Views/PortfolioView.swift`
- Create: `MansajeBudget/Views/RetirementPlannerView.swift`
- Modify: `MansajeBudget/Views/GoalDetailView.swift` (add milestones section)

**WealthViewModel pattern:**

```swift
@MainActor
final class WealthViewModel: ObservableObject {
    @Published var netWorth: Double = 0
    @Published var history: [NetWorthSnapshot] = []
    @Published var holdings: [Holding] = []
    @Published var isLoading = false

    func loadNetWorth() async {
        isLoading = true
        defer { isLoading = false }
        // Call GET /v1/wealth/net-worth via NetworkService
        // Call GET /v1/wealth/net-worth/history
    }

    func loadPortfolio() async {
        // Call GET /v1/wealth/portfolio
    }
}
```

**Step: Commit**

```bash
git add MansajeBudget/ViewModels/WealthViewModel.swift \
        MansajeBudget/ViewModels/RetirementViewModel.swift \
        MansajeBudget/Views/WealthDashboardView.swift \
        MansajeBudget/Views/PortfolioView.swift \
        MansajeBudget/Views/RetirementPlannerView.swift
git commit -m "feat(ios): add wealth management screens"
```

---

## Phase 4 — Web App

### Task 16: Install Supabase + configure SSR

**Files:**
- Modify: `MansajeBudgetWeb/package.json`
- Create: `MansajeBudgetWeb/middleware.ts`
- Create: `MansajeBudgetWeb/src/lib/supabase/client.ts`
- Create: `MansajeBudgetWeb/src/lib/supabase/server.ts`
- Create: `MansajeBudgetWeb/.env.local.example`

**Step 1: Install**

```bash
cd MansajeBudgetWeb
npm install @supabase/supabase-js @supabase/ssr
```

**Step 2: `src/lib/supabase/client.ts`**

```typescript
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

**Step 3: `src/lib/supabase/server.ts`**

```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options))
        },
      },
    }
  )
}
```

**Step 4: `middleware.ts`**

```typescript
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value)
            supabaseResponse.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // Redirect unauthenticated users to login
  if (!user && !request.nextUrl.pathname.startsWith('/login') &&
      !request.nextUrl.pathname.startsWith('/auth')) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
```

**Step 5: `.env.local.example`**

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
NEXT_PUBLIC_BACKEND_URL=https://your-backend.com
```

**Step 6: `src/lib/api.ts` — typed fetch wrapper**

```typescript
const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL

async function apiFetch<T>(path: string, init?: RequestInit, token?: string): Promise<T> {
  const res = await fetch(`${BACKEND}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  })
  if (!res.ok) throw new Error(`API error ${res.status}`)
  return res.json()
}

export const api = {
  transactions: {
    list: (token: string, params?: Record<string, string>) =>
      apiFetch<Transaction[]>(`/v1/transactions?${new URLSearchParams(params)}`, {}, token),
  },
  budgets: {
    list: (token: string, month: number, year: number) =>
      apiFetch<Budget[]>(`/v1/budgets?month=${month}&year=${year}`, {}, token),
  },
  wealth: {
    netWorth: (token: string) => apiFetch<NetWorthSummary>('/v1/wealth/net-worth', {}, token),
    history: (token: string) => apiFetch<NetWorthSnapshot[]>('/v1/wealth/net-worth/history', {}, token),
    portfolio: (token: string) => apiFetch<Portfolio>('/v1/wealth/portfolio', {}, token),
    retirement: (token: string) => apiFetch<RetirementProjection>('/v1/wealth/retirement', {}, token),
  },
  // (add remaining routes following the same pattern)
}
```

**Step 7: Commit**

```bash
git add MansajeBudgetWeb/
git commit -m "feat(web): add Supabase SSR client, middleware, API wrapper"
```

---

### Task 17: Auth pages

**Files:**
- Create: `MansajeBudgetWeb/src/app/(auth)/login/page.tsx`
- Create: `MansajeBudgetWeb/src/app/auth/callback/route.ts`

**Step 1: Login page**

```tsx
'use client'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const supabase = createClient()

  const signInWithGoogle = () =>
    supabase.auth.signInWithOAuth({ provider: 'google',
      options: { redirectTo: `${location.origin}/auth/callback` } })

  const signInWithApple = () =>
    supabase.auth.signInWithOAuth({ provider: 'apple',
      options: { redirectTo: `${location.origin}/auth/callback` } })

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950">
      <div className="bg-gray-900 rounded-2xl p-8 w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-bold text-white text-center">MansajeBudget</h1>
        <button onClick={signInWithGoogle}
          className="w-full flex items-center justify-center gap-3 bg-white text-gray-900
                     font-medium py-3 rounded-xl hover:bg-gray-100 transition">
          Continue with Google
        </button>
        <button onClick={signInWithApple}
          className="w-full flex items-center justify-center gap-3 bg-gray-800 text-white
                     font-medium py-3 rounded-xl hover:bg-gray-700 transition">
          Continue with Apple
        </button>
      </div>
    </div>
  )
}
```

**Step 2: Auth callback route**

```typescript
// src/app/auth/callback/route.ts
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  if (code) {
    const supabase = await createClient()
    await supabase.auth.exchangeCodeForSession(code)
  }
  return NextResponse.redirect(`${origin}/dashboard`)
}
```

**Step 3: Commit**

```bash
git add MansajeBudgetWeb/src/app/
git commit -m "feat(web): add login page and auth callback"
```

---

### Task 18: Protected layout + shared components

**Files:**
- Create: `MansajeBudgetWeb/src/app/(app)/layout.tsx`
- Create: `MansajeBudgetWeb/src/components/layout/Sidebar.tsx`
- Create: `MansajeBudgetWeb/src/components/ui/` (Card, Button, Badge, Skeleton)

**Step 1: Protected layout**

```tsx
// src/app/(app)/layout.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/layout/Sidebar'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div className="flex h-screen bg-gray-950 text-white">
      <Sidebar />
      <main className="flex-1 overflow-y-auto p-6">{children}</main>
    </div>
  )
}
```

**Step 2: Sidebar with all nav items**

```tsx
// src/components/layout/Sidebar.tsx
'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const nav = [
  { href: '/dashboard',    label: 'Dashboard' },
  { href: '/transactions', label: 'Transactions' },
  { href: '/budgets',      label: 'Budgets' },
  { href: '/accounts',     label: 'Accounts' },
  { href: '/goals',        label: 'Goals' },
  { href: '/reports',      label: 'Reports' },
  { href: '/wealth',       label: 'Wealth' },
  { href: '/retirement',   label: 'Retirement' },
  { href: '/insights',     label: 'Insights' },
  { href: '/recurring',    label: 'Recurring' },
  { href: '/settings',     label: 'Settings' },
]

export default function Sidebar() {
  const path = usePathname()
  return (
    <aside className="w-56 bg-gray-900 flex flex-col py-6 px-4 gap-1 shrink-0">
      <div className="text-xl font-bold text-white mb-6 px-2">Mansaje</div>
      {nav.map(({ href, label }) => (
        <Link key={href} href={href}
          className={`px-3 py-2 rounded-lg text-sm font-medium transition
            ${path.startsWith(href)
              ? 'bg-indigo-600 text-white'
              : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}>
          {label}
        </Link>
      ))}
    </aside>
  )
}
```

**Step 3: Commit**

```bash
git add MansajeBudgetWeb/src/
git commit -m "feat(web): add protected layout and sidebar navigation"
```

---

### Task 19: Build all 12 screens

Build each screen as a Next.js server component (or client component where interactivity requires it). Each screen follows this pattern:

```tsx
// src/app/(app)/dashboard/page.tsx
import { createClient } from '@/lib/supabase/server'
import { api } from '@/lib/api'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  const token = session!.access_token

  const [netWorth, transactions, budgets] = await Promise.all([
    api.wealth.netWorth(token),
    api.transactions.list(token, { limit: '5' }),
    api.budgets.list(token, new Date().getMonth() + 1, new Date().getFullYear()),
  ])

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      {/* NetWorthCard, RecentTransactions, BudgetProgress components */}
    </div>
  )
}
```

**Screens and their primary data fetches:**

| Screen | Path | Primary API calls |
|--------|------|-------------------|
| Dashboard | `/dashboard` | net-worth, transactions (5), budgets |
| Transactions | `/transactions` | transactions (paginated, filterable) |
| Budgets | `/budgets` | budgets (month/year), transactions |
| Accounts | `/accounts` | accounts, connections |
| Goals | `/goals` | goals, goal_milestones |
| Reports | `/reports` | reports/spending, reports/monthly |
| Wealth | `/wealth` | wealth/net-worth/history, accounts |
| Portfolio | `/wealth/portfolio` (or `/portfolio`) | wealth/portfolio |
| Retirement | `/retirement` | wealth/retirement |
| Insights | `/insights` | insights |
| Recurring | `/recurring` | recurring |
| Settings | `/settings` | accounts, exports |

**Charts (Recharts) — use these components:**

```tsx
// Spending by category — PieChart
import { PieChart, Pie, Cell, Tooltip, Legend } from 'recharts'

// Net worth over time — LineChart
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'

// Monthly spending — BarChart
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'

// Retirement projection — AreaChart
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'
```

**Step: Commit after each screen**

```bash
git add MansajeBudgetWeb/src/app/(app)/<screen>/
git commit -m "feat(web): add <screen> screen"
```

---

## Phase 5 — Cleanup + Deployment

### Task 20: Remove all remaining Firebase artifacts

**Files to delete:**
- `MansajeBudget/Services/FirestoreService.swift`
- `MansajeBudget/GoogleService-Info.plist`
- `MansajeBudget/MansajeBudgetApp.swift` — remove `FirebaseApp.configure()`
- `firestore.rules` (root — now replaced by Supabase RLS)
- `firebase.json`
- `firestore.indexes.json`

```bash
git rm MansajeBudget/Services/FirestoreService.swift \
       MansajeBudget/GoogleService-Info.plist \
       firestore.rules firebase.json firestore.indexes.json
git commit -m "chore: remove all Firebase artifacts"
```

---

### Task 21: Final verification checklist

Run through each item before declaring done:

- [ ] `cd MansajeBudgetBackend && npm start` — server starts, no Firebase errors
- [ ] `POST /health` returns `{ status: 'ok' }`
- [ ] Auth middleware rejects requests without token
- [ ] Auth middleware accepts valid Supabase JWT
- [ ] Webhook endpoint returns 401 for unauthenticated POST (CRIT-1 ✓)
- [ ] `plaid_tokens` table is inaccessible via anon client (CRIT-2 ✓)
- [ ] Plaid token stored encrypted (`pgp_sym_encrypt` — CRIT-2 ✓)
- [ ] Transaction upsert with same `plaid_transaction_id` does not duplicate (HIGH-4 ✓)
- [ ] iOS app builds without Firebase framework references
- [ ] iOS Apple Sign In completes successfully
- [ ] iOS Realtime channel receives updates on transaction change
- [ ] Web app: unauthenticated request redirects to `/login`
- [ ] Web app: all 12 screens load without errors
- [ ] Web Dashboard displays net worth card + recent transactions
- [ ] Web Retirement planner: changing sliders updates projection chart
- [ ] `SUPABASE_SERVICE_ROLE_KEY` not exposed in any client-side code

```bash
git tag v2.0.0-supabase
git push origin main --tags
```

---

## Environment Variable Reference

### Backend

```bash
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...          # NEVER expose client-side
PLAID_TOKEN_ENCRYPTION_KEY=...        # 32-byte hex, used with pgcrypto
PLAID_CLIENT_ID=...
PLAID_SECRET=...
PLAID_ENV=sandbox
PLAID_VERIFY_WEBHOOKS=true
ANTHROPIC_API_KEY=...
PORT=3000
NODE_ENV=production
ALLOWED_ORIGINS=https://your-domain.com
```

### iOS (.xcconfig)

```
SUPABASE_URL = https://$(SUPABASE_PROJECT_REF).supabase.co
SUPABASE_ANON_KEY = ...
BACKEND_URL = https://your-backend.com
```

### Web (.env.local)

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
NEXT_PUBLIC_BACKEND_URL=https://your-backend.com
```
