-- 001_initial_schema.sql
-- MansajeBudget — full Postgres schema with RLS
-- Run in Supabase SQL Editor after enabling pgcrypto extension

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
