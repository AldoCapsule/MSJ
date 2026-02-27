# Firebase → Supabase Migration Design

**Date**: 2026-02-27  
**Approach**: Big Bang Cutover (greenfield — no live user data)  
**Scope**: Backend (Node.js) + iOS (SwiftUI) + Web (Next.js 14)  
**Includes**: Wealth Management Plugin (net worth, portfolio, retirement, goal milestones)

---

## 1. Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Supabase                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │  Auth        │  │  Postgres    │  │  Realtime        │  │
│  │  (Apple/     │  │  (RLS-       │  │  (websocket      │  │
│  │   Google)    │  │   enforced)  │  │   channels)      │  │
│  └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘  │
└─────────┼─────────────────┼───────────────────┼────────────┘
          │ JWT              │ SQL               │ Realtime
          ▼                  ▼                   ▼
┌─────────────────┐   ┌─────────────────────────────────────┐
│  Node.js API    │   │  Clients                            │
│  (Express)      │◄──┤                                     │
│                 │   │  iOS (supabase-swift)               │
│  service_role   │   │  Web (Next.js 14 + @supabase/ssr)   │
│  bypasses RLS   │   │                                     │
│  for webhooks   │   │  anon key + user JWT                │
└─────────────────┘   └─────────────────────────────────────┘
          ▲
          │
   Plaid webhooks (ES256 JWT verified — CRIT-1 already fixed)
```

### Key decisions

- **Single source of truth** — Postgres replaces all 14 Firestore collections.
- **Two Supabase client modes** — `service_role` for the Node.js backend (webhook writes, bypasses RLS); `anon` key + user JWT for iOS and web (RLS enforced).
- **Plaid tokens encrypted at rest** — `pgp_sym_encrypt()` via `pgcrypto`. Fixes CRIT-2 as part of this migration.
- **Realtime** — Supabase Realtime channels (Postgres logical replication) replace Firestore `addSnapshotListener`.
- **Auth** — Supabase Auth with Apple and Google OAuth. JWT format changes; iOS nonce logic is unchanged.

---

## 2. Postgres Schema

### Core tables

```sql
-- Mirrors auth.users
create table users (
  id uuid primary key references auth.users on delete cascade,
  display_name text,
  created_at timestamptz default now()
);

-- Bank accounts
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

-- Plaid items
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

-- Encrypted Plaid access tokens (server-only — no RLS policy = full client deny)
create table plaid_tokens (
  connection_id uuid primary key references connections on delete cascade,
  user_id uuid not null references users on delete cascade,
  access_token_encrypted text not null  -- pgp_sym_encrypt(token, app_secret)
);

-- Transactions — id = plaid_transaction_id (eliminates duplicate writes)
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
  review_status text default 'unreviewed',
  notes text,
  tags text[],
  last_synced_at timestamptz,
  created_at timestamptz default now()
);

-- Budgets
create table budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users on delete cascade,
  category text not null,
  amount_limit numeric(12,2) not null check (amount_limit > 0),
  month int check (month between 1 and 12),
  year int,
  created_at timestamptz default now()
);

-- Goals
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

-- Categories, alerts, alert_events, rules, recurring_streams,
-- investments, insights follow the same user_id FK + RLS pattern.
```

### Wealth Management tables

```sql
-- Daily net worth snapshots
create table net_worth_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users on delete cascade,
  total_assets numeric(12,2) not null,
  total_liabilities numeric(12,2) not null,
  net_worth numeric(12,2) generated always as (total_assets - total_liabilities) stored,
  snapshot_date date not null,
  unique(user_id, snapshot_date)
);

-- Retirement projection parameters
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

-- Goal milestones
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
```

### RLS policy pattern (applied to every table except `plaid_tokens`)

```sql
alter table transactions enable row level security;
create policy "users own their data"
  on transactions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
-- plaid_tokens: enable RLS but add NO policy = total client deny
```

### Bugs fixed by schema design

| Bug | Fix |
|-----|-----|
| CRIT-2 — plaintext Plaid tokens | `access_token_encrypted` via `pgp_sym_encrypt` |
| HIGH-4 — UUID duplicate transactions | `transactions.id = plaid_transaction_id` |
| HIGH-5 — broken Timestamp→Date cast | Native `timestamptz` / `date` columns |

---

## 3. Auth Migration

### Supabase project setup

```
Supabase Dashboard → Authentication → Providers
  ✓ Apple   — Service ID + private key (.p8)
  ✓ Google  — OAuth client ID + secret
```

### Backend token verification

```javascript
// middleware/auth.js — AFTER
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

const { data: { user }, error } = await supabase.auth.getUser(idToken);
if (error || !user) return res.status(401).json({ error: 'Unauthorized' });
req.uid = user.id;
req.accessToken = idToken;
```

### iOS

```swift
// AuthService.swift — Apple Sign In (nonce logic unchanged)
try await supabase.auth.signInWithIdToken(
  credentials: .init(provider: .apple, idToken: appleIDToken, nonce: rawNonce)
)

// AuthService.swift — Google Sign In
try await supabase.auth.signInWithIdToken(
  credentials: .init(provider: .google, idToken: googleIDToken, accessToken: accessToken)
)

// Get JWT for backend API calls (replaces getIDToken())
let token = try await supabase.auth.session.accessToken
```

### Web

```typescript
// middleware.ts — session refresh on every request
import { createServerClient } from '@supabase/ssr'
// Handles cookie-based session management automatically
```

---

## 4. Backend Migration

### Supabase client module (`db.js`)

```javascript
const { createClient } = require('@supabase/supabase-js');

// service_role: bypasses RLS — webhook handlers, wealth snapshot jobs
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// User-scoped: RLS enforced via JWT
const supabaseForUser = (accessToken) =>
  createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });

module.exports = { supabaseAdmin, supabaseForUser };
```

### Route translation pattern

```javascript
// BEFORE (all 13 route files)
const db = () => admin.firestore();
const snap = await db().collection('users').doc(uid).collection('transactions')
  .where('userId', '==', uid).orderBy('date', 'desc').limit(50).get();
const txns = snap.docs.map(d => d.data());

// AFTER
const { supabaseForUser } = require('../db');
const sb = supabaseForUser(req.accessToken);
const { data: txns, error } = await sb
  .from('transactions')
  .select('*')
  .order('date', { ascending: false })
  .limit(50);
```

### Webhook handler

```javascript
// Uses supabaseAdmin — service_role bypasses RLS
const { data: conn } = await supabaseAdmin
  .from('connections')
  .select('id, sync_cursor, user_id')
  .eq('plaid_item_id', itemId)
  .single();

// Upsert with plaid_transaction_id as PK — idempotent, no duplicates
await supabaseAdmin.from('transactions').upsert(
  added.map(txn => ({ id: txn.transaction_id, user_id: conn.user_id, ... })),
  { onConflict: 'id' }
);
```

### New wealth routes (`routes/v1/wealth.js`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/v1/wealth/net-worth` | Live net worth from accounts |
| GET | `/v1/wealth/net-worth/history` | Time-series from snapshots |
| GET | `/v1/wealth/portfolio` | Holdings + performance (Plaid Investments) |
| GET | `/v1/wealth/retirement` | Projection params + compound growth calc |
| PUT | `/v1/wealth/retirement` | Save projection params |
| GET/POST/PATCH/DELETE | `/v1/goals/:id/milestones` | Goal milestones CRUD |

### `package.json` changes

```diff
- "firebase-admin": "^12.1.0"
+ "@supabase/supabase-js": "^2.x"
```

---

## 5. iOS Migration

### Scope

Only two files touch Firebase directly:
- `Services/AuthService.swift` — replaced with Supabase Auth (see Section 3)
- `Services/FirestoreService.swift` → `Services/SupabaseService.swift`

All 8 ViewModels update their service calls. Views are unchanged.

### Real-time listener pattern

```swift
// BEFORE — Firestore
db.collection("users/\(uid)/transactions")
  .order(by: "date", descending: true)
  .addSnapshotListener { snapshot, _ in
    self.transactions = snapshot?.documents.map { ... } ?? []
  }

// AFTER — Supabase Realtime
let channel = supabase.realtimeV2.channel("transactions:\(uid)")
await channel
  .onPostgresChanges(AnyAction.self, table: "transactions",
                     filter: .eq("user_id", value: uid)) { [weak self] _ in
    Task { await self?.loadTransactions() }
  }
  .subscribe()
```

### KeychainService

Plaid tokens move server-side (encrypted Postgres). Keychain retains Supabase session refresh token with identical security attributes (`kSecAttrAccessibleWhenUnlockedThisDeviceOnly`).

### Constants.swift (fixes HIGH-3)

```swift
// BEFORE — broken placeholder
static let baseURL = "https://your-backend.example.com"

// AFTER — from .xcconfig
static let baseURL      = Secrets.backendURL
static let supabaseURL  = Secrets.supabaseURL
static let supabaseKey  = Secrets.supabaseAnonKey
```

### New Wealth Management screens

| View | ViewModel | Backend endpoint |
|------|-----------|-----------------|
| `WealthDashboardView` | `WealthViewModel` | `/v1/wealth/net-worth/history` |
| `PortfolioView` | `WealthViewModel` | `/v1/wealth/portfolio` |
| `RetirementPlannerView` | `RetirementViewModel` | `/v1/wealth/retirement` |
| `GoalDetailView` (updated) | `BudgetViewModel` | `/v1/goals/:id/milestones` |

---

## 6. Web App

### Structure

```
MansajeBudgetWeb/
├── middleware.ts
├── src/app/
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   └── callback/route.ts
│   ├── (app)/                    ← protected layout
│   │   ├── layout.tsx
│   │   ├── dashboard/page.tsx
│   │   ├── transactions/page.tsx
│   │   ├── budgets/page.tsx
│   │   ├── accounts/page.tsx
│   │   ├── goals/page.tsx
│   │   ├── reports/page.tsx
│   │   ├── wealth/page.tsx
│   │   ├── retirement/page.tsx
│   │   ├── insights/page.tsx
│   │   ├── recurring/page.tsx
│   │   └── settings/page.tsx
│   └── api/auth/callback/route.ts
├── src/lib/
│   ├── supabase/
│   │   ├── client.ts             ← browser client
│   │   └── server.ts             ← server component client
│   └── api.ts                    ← typed fetch → Node.js backend
└── src/components/
    ├── ui/                       ← Button, Card, Modal, Badge, Skeleton
    ├── charts/                   ← Recharts wrappers
    └── layout/                   ← Sidebar, TopBar, MobileNav
```

### Screen inventory

| Screen | Key components | Data source |
|--------|----------------|-------------|
| Dashboard | Net worth card, spending ring, recent transactions, budget progress | `/v1/wealth/net-worth`, `/v1/transactions`, `/v1/budgets` |
| Transactions | Infinite scroll, filter/search, bulk edit, category badges | `/v1/transactions` |
| Budgets | Progress bars, month picker | `/v1/budgets` |
| Accounts | Account list, Plaid Link button, balance summary | `/v1/accounts` |
| Goals | Goal cards with milestone progress, add/edit modal | `/v1/goals`, `/v1/goals/:id/milestones` |
| Reports | Spending by category (pie), monthly trend (bar) | `/v1/reports` |
| Wealth | Net worth trend (line), asset/liability breakdown | `/v1/wealth/net-worth/history` |
| Portfolio | Holdings table, allocation pie, unrealized gain/loss | `/v1/wealth/portfolio` |
| Retirement | Input sliders + compound growth projection chart | `/v1/wealth/retirement` |
| Insights | Monthly AI summary cards | `/v1/insights` |
| Recurring | Recurring streams list, frequency badges | `/v1/recurring` |
| Settings | Profile, connected banks, export, delete account | `/v1/exports` |

### `package.json` additions

```diff
+ "@supabase/supabase-js": "^2.x"
+ "@supabase/ssr": "^0.x"
```

---

## 7. Environment Variables

### Backend (`.env`)

```bash
# Supabase
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...

# Plaid token encryption key (used with pgp_sym_encrypt)
PLAID_TOKEN_ENCRYPTION_KEY=<random-32-byte-hex>

# Plaid (unchanged)
PLAID_CLIENT_ID=...
PLAID_SECRET=...
PLAID_ENV=sandbox
PLAID_VERIFY_WEBHOOKS=true

# Anthropic (unchanged)
ANTHROPIC_API_KEY=...
```

### iOS (`.xcconfig`)

```
SUPABASE_URL = https://<ref>.supabase.co
SUPABASE_ANON_KEY = ...
BACKEND_URL = https://your-backend.com
```

### Web (`.env.local`)

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
NEXT_PUBLIC_BACKEND_URL=https://your-backend.com
```

---

## 8. Migration Checklist

- [ ] Create Supabase project
- [ ] Enable Apple + Google OAuth providers in Supabase dashboard
- [ ] Run SQL schema migrations (all tables + RLS policies)
- [ ] Enable `pgcrypto` extension for Plaid token encryption
- [ ] Backend: replace `firebase-admin` with `@supabase/supabase-js`
- [ ] Backend: migrate all 13 route files (Firestore → Postgres)
- [ ] Backend: add `routes/v1/wealth.js` (4 new routes + milestones)
- [ ] Backend: update `.env.example` with Supabase variables
- [ ] iOS: replace `FirestoreService` with `SupabaseService`
- [ ] iOS: update `AuthService` for Supabase Auth
- [ ] iOS: add Wealth Management screens (4 new views + viewmodels)
- [ ] iOS: fix `Constants.swift` placeholder URL (HIGH-3)
- [ ] Web: build full app (12 screens, Supabase SSR auth, Recharts)
- [ ] Remove Firebase project / revoke service account keys
