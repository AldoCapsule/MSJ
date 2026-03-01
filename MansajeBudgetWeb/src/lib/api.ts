const BASE = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000'

async function get<T>(path: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
    })
    if (!res.ok) return fallback
    return res.json()
  } catch {
    return fallback
  }
}

async function post<T>(path: string, body: unknown, fallback: T): Promise<T> {
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) return fallback
    return res.json()
  } catch {
    return fallback
  }
}

async function put<T>(path: string, body: unknown, fallback: T): Promise<T> {
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) return fallback
    return res.json()
  } catch {
    return fallback
  }
}

// Normalize a Firestore Timestamp, ISO string, or Date → 'YYYY-MM-DD'
function fmtDate(v: unknown): string {
  if (!v) return ''
  if (typeof v === 'string') return v.slice(0, 10)
  if (typeof v === 'object') {
    const ts = v as { _seconds?: number; seconds?: number; toDate?: () => Date }
    if (ts._seconds != null) return new Date(ts._seconds * 1000).toISOString().slice(0, 10)
    if (ts.seconds != null) return new Date(ts.seconds * 1000).toISOString().slice(0, 10)
    if (typeof ts.toDate === 'function') return ts.toDate().toISOString().slice(0, 10)
    if (v instanceof Date) return v.toISOString().slice(0, 10)
  }
  return String(v).slice(0, 10)
}

// Normalize a Firestore Timestamp → 'YYYY-MM' (for net-worth history labels)
function fmtMonth(v: unknown): string {
  return fmtDate(v).slice(0, 7)
}

// Mock data for when backend is unavailable
export const mock = {
  netWorth: { assets: 49433.39, liabilities: 2149.87, net_worth: 47283.52 },
  netWorthHistory: [
    { snapshot_date: '2025-08', net_worth: 41200, total_assets: 43350, total_liabilities: 2150 },
    { snapshot_date: '2025-09', net_worth: 42800, total_assets: 44950, total_liabilities: 2150 },
    { snapshot_date: '2025-10', net_worth: 41900, total_assets: 44050, total_liabilities: 2150 },
    { snapshot_date: '2025-11', net_worth: 44100, total_assets: 46250, total_liabilities: 2150 },
    { snapshot_date: '2025-12', net_worth: 43600, total_assets: 45750, total_liabilities: 2150 },
    { snapshot_date: '2026-01', net_worth: 45200, total_assets: 47350, total_liabilities: 2150 },
    { snapshot_date: '2026-02', net_worth: 47284, total_assets: 49434, total_liabilities: 2150 },
  ],
  transactions: [
    { id: 'tx1', name: 'Whole Foods', category: 'Groceries', amount: 86.42, date: '2026-02-27', is_pending: false },
    { id: 'tx2', name: 'Netflix', category: 'Entertainment', amount: 15.99, date: '2026-02-27', is_pending: false },
    { id: 'tx3', name: 'Payroll Deposit', category: 'Income', amount: -4200.00, date: '2026-02-26', is_pending: false },
    { id: 'tx4', name: 'Uber', category: 'Transport', amount: 23.10, date: '2026-02-26', is_pending: true },
    { id: 'tx5', name: 'Starbucks', category: 'Coffee', amount: 6.75, date: '2026-02-25', is_pending: false },
    { id: 'tx6', name: 'Amazon', category: 'Shopping', amount: 54.99, date: '2026-02-24', is_pending: false },
    { id: 'tx7', name: 'Rent', category: 'Housing', amount: 1800.00, date: '2026-02-01', is_pending: false },
    { id: 'tx8', name: 'PG&E', category: 'Utilities', amount: 94.20, date: '2026-02-05', is_pending: false },
  ],
  accounts: [
    { id: 'ac1', name: 'Chase Checking', type: 'checking', institution_name: 'Chase', current_balance: 4821.33, mask: '4521' },
    { id: 'ac2', name: 'Marcus Savings', type: 'savings', institution_name: 'Marcus', current_balance: 18492.00, mask: '8832' },
    { id: 'ac3', name: 'Sapphire Reserve', type: 'credit', institution_name: 'Chase', current_balance: 2149.87, mask: '9041' },
    { id: 'ac4', name: 'Fidelity Brokerage', type: 'investment', institution_name: 'Fidelity', current_balance: 26120.06, mask: '3302' },
  ],
  budgets: [
    { id: 'b1', category: 'Food & Dining', amount_limit: 600, spent: 487, month: 2, year: 2026 },
    { id: 'b2', category: 'Transport', amount_limit: 250, spent: 112, month: 2, year: 2026 },
    { id: 'b3', category: 'Entertainment', amount_limit: 200, spent: 185, month: 2, year: 2026 },
    { id: 'b4', category: 'Shopping', amount_limit: 300, spent: 94, month: 2, year: 2026 },
  ],
  goals: [
    { id: 'g1', name: 'Emergency Fund', target_amount: 25000, current_amount: 18492, target_date: '2026-12-31', is_completed: false },
    { id: 'g2', name: 'Vacation to Japan', target_amount: 5000, current_amount: 2200, target_date: '2026-08-01', is_completed: false },
    { id: 'g3', name: 'New MacBook', target_amount: 2500, current_amount: 2500, target_date: '2026-01-15', is_completed: true },
  ],
  holdings: [
    { security_id: 's1', name: 'Apple Inc', ticker: 'AAPL', quantity: 15, institution_value: 3342.00, cost_basis: 2800.00 },
    { security_id: 's2', name: 'Vanguard S&P 500', ticker: 'VOO', quantity: 20, institution_value: 9420.00, cost_basis: 8100.00 },
    { security_id: 's3', name: 'Tesla Inc', ticker: 'TSLA', quantity: 8, institution_value: 1736.00, cost_basis: 2200.00 },
    { security_id: 's4', name: 'Microsoft Corp', ticker: 'MSFT', quantity: 10, institution_value: 4280.00, cost_basis: 3600.00 },
  ],
  retirement: {
    user_id: 'dev', current_age: 32, retirement_age: 65,
    current_savings: 44612, monthly_contribution: 800,
    expected_annual_return: 0.07, target_amount: 2000000,
    projected_amount: 1847320,
  },
  insights: [
    { id: 'i1', month: 2, year: 2026, content: 'Great month! Your savings rate hit 32%, up from 28% in January. Your biggest win was reducing dining out by $94. Your emergency fund is now 74% funded — at this pace, you\'ll hit the goal by September. Consider increasing your monthly 401k contribution by $100 to take full advantage of compound growth.', model: 'claude-haiku-4-5', created_at: '2026-02-28T00:00:00Z' },
    { id: 'i2', month: 1, year: 2026, content: 'January was a solid start to the year. Net worth grew by $1,800. Your entertainment budget came in under at 87% usage. One area to watch: three subscription services renewed — consider auditing which you actually use regularly.', model: 'claude-haiku-4-5', created_at: '2026-01-31T00:00:00Z' },
  ],
  recurring: [
    { id: 'r1', name: 'Rent', amount: 1800, frequency: 'monthly', category: 'Housing', is_active: true, next_date: '2026-03-01' },
    { id: 'r2', name: 'Netflix', amount: 15.99, frequency: 'monthly', category: 'Entertainment', is_active: true, next_date: '2026-03-05' },
    { id: 'r3', name: 'Spotify', amount: 9.99, frequency: 'monthly', category: 'Entertainment', is_active: true, next_date: '2026-03-12' },
    { id: 'r4', name: 'Planet Fitness', amount: 24.99, frequency: 'monthly', category: 'Health', is_active: true, next_date: '2026-03-19' },
    { id: 'r5', name: 'Payroll', amount: 4200, frequency: 'biweekly', category: 'Income', is_active: true, next_date: '2026-03-01' },
  ],
}

export const api = {
  wealth: {
    netWorth: async () => {
      // Backend: GET /v1/reports/dashboard → { net_worth, assets_total, liabilities_total, ... }
      const d = await get<any>('/v1/reports/dashboard', null)
      if (d?.net_worth != null) {
        return { net_worth: d.net_worth, assets: d.assets_total, liabilities: d.liabilities_total }
      }
      return mock.netWorth
    },
    history: async () => {
      // Backend: GET /v1/reports/networth → { snapshots: [{ net_worth_total, assets_total, debts_total, as_of_date }] }
      const d = await get<any>('/v1/reports/networth', null)
      if (d?.snapshots?.length) {
        return d.snapshots.map((s: any) => ({
          snapshot_date: fmtMonth(s.as_of_date),
          net_worth: s.net_worth_total ?? 0,
          total_assets: s.assets_total ?? 0,
          total_liabilities: s.debts_total ?? 0,
        }))
      }
      return mock.netWorthHistory
    },
    portfolio: async () => {
      // Backend: GET /v1/investments/holdings → { holdings: [{ id, symbol, quantity, cost_basis, value_current }] }
      const d = await get<any>('/v1/investments/holdings', null)
      if (d?.holdings?.length) {
        return {
          holdings: d.holdings.map((h: any) => ({
            security_id: h.id,
            name: h.symbol,
            ticker: h.symbol,
            quantity: h.quantity ?? 0,
            institution_value: h.value_current ?? 0,
            cost_basis: h.cost_basis ?? 0,
          })),
          securities: [],
        }
      }
      return { holdings: mock.holdings, securities: [] }
    },
    retirement: () => get('/v1/retirement', mock.retirement),
    updateRetirement: (data: unknown) => put('/v1/retirement', data, mock.retirement),
  },
  transactions: {
    list: async (params?: string) => {
      // Backend: GET /v1/transactions → { transactions: [...], count }
      const d = await get<any>(`/v1/transactions${params ? '?' + params : ''}`, null)
      if (d?.transactions) return d.transactions
      return mock.transactions
    },
  },
  accounts: {
    list: async () => {
      // Backend: GET /v1/accounts → { accounts: [...] }
      // Normalize balance field: backend may use balance, balance_current, or current_balance
      const d = await get<any>('/v1/accounts', null)
      if (d?.accounts?.length) {
        return d.accounts.map((a: any) => ({
          ...a,
          current_balance: a.current_balance ?? a.balance_current ?? a.balance ?? 0,
        }))
      }
      return mock.accounts
    },
  },
  budgets: {
    list: async (month: number, year: number) => {
      // Backend: GET /v1/budgets?month=YYYY-MM → { budgets: [{ ..., lines: [{ category_id, amount_planned, amount_actual_cached }] }] }
      const monthStr = `${year}-${String(month).padStart(2, '0')}`
      const d = await get<any>(`/v1/budgets?month=${monthStr}`, null)
      if (d?.budgets?.length) {
        const flat: typeof mock.budgets = []
        for (const budget of d.budgets) {
          for (const line of (budget.lines || [])) {
            flat.push({
              id: line.id,
              category: line.category_id || 'Other',
              amount_limit: line.amount_planned ?? 0,
              spent: line.amount_actual_cached ?? 0,
              month,
              year,
            })
          }
        }
        if (flat.length) return flat
      }
      return mock.budgets
    },
  },
  goals: {
    list: async () => {
      // Backend: GET /v1/goals → { goals: [{ ..., current_balance, target_amount, target_date }] }
      const d = await get<any>('/v1/goals', null)
      if (d?.goals?.length) {
        return d.goals.map((g: any) => ({
          ...g,
          current_amount: g.current_balance ?? g.current_amount ?? 0,
          is_completed: (g.current_balance ?? g.current_amount ?? 0) >= g.target_amount,
          target_date: fmtDate(g.target_date),
        }))
      }
      return mock.goals
    },
  },
  insights: {
    list: async () => {
      // Backend: GET /v1/insights → { insights: [{ month: 'YYYY-MM', summary, generated_at, ... }] }
      const d = await get<any>('/v1/insights', null)
      if (d?.insights?.length) {
        return d.insights.map((i: any) => {
          const [yr, mo] = (i.month || '2026-01').split('-').map(Number)
          return {
            id: i.id || i.month,
            month: mo,
            year: yr,
            content: i.summary || '',
            model: 'claude-haiku-4-5',
            created_at: fmtDate(i.generated_at),
          }
        })
      }
      return mock.insights
    },
  },
  reports: {
    spending: async (params?: string) => {
      // Backend: GET /v1/reports/spending?group_by=category → { spending: [{ period, breakdown, total }] }
      const d = await get<any>(`/v1/reports/spending${params ? '?' + params : ''}`, null)
      return d?.spending ?? []
    },
    cashflow: async (month: string) => {
      // Backend: GET /v1/reports/cashflow?month=YYYY-MM → { month, income_total, expense_total, net_total }
      return get<any>(`/v1/reports/cashflow?month=${month}`, null)
    },
  },
  recurring: {
    list: async () => {
      // Backend: GET /v1/recurring → { recurring: [{ merchant_name, last_amount, cadence, next_due_date }] }
      const d = await get<any>('/v1/recurring', null)
      if (d?.recurring?.length) {
        return d.recurring.map((r: any) => ({
          id: r.id,
          name: r.merchant_name || r.name || 'Unknown',
          amount: r.last_amount ?? r.amount ?? 0,
          frequency: r.cadence || r.frequency || 'monthly',
          category: r.category || 'Subscription',
          is_active: r.is_active ?? true,
          next_date: fmtDate(r.next_due_date || r.next_date),
        }))
      }
      return mock.recurring
    },
  },
}
