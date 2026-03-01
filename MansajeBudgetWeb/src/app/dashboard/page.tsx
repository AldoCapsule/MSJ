'use client'
import { useEffect, useState } from 'react'
import AppShell from '@/components/layout/AppShell'
import { api, mock } from '@/lib/api'
import { TrendingUp, TrendingDown, DollarSign, ArrowUpRight } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts'

const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.abs(n))
const fmtFull = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)

export default function DashboardPage() {
  const [nw, setNw] = useState(mock.netWorth)
  const [history, setHistory] = useState(mock.netWorthHistory)
  const [txns, setTxns] = useState(mock.transactions)
  const [budgets, setBudgets] = useState(mock.budgets)

  useEffect(() => {
    api.wealth.netWorth().then(setNw)
    api.wealth.history().then(setHistory)
    api.transactions.list('limit=8').then(setTxns)
    const now = new Date()
    api.budgets.list(now.getMonth() + 1, now.getFullYear()).then(setBudgets)
  }, [])

  const income = txns.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0)
  const spent = txns.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0)

  return (
    <AppShell>
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-slate-500 text-sm mt-0.5">Good morning, Alex</p>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: 'Net Worth', value: fmtFull(nw.net_worth), change: '+2.7%', up: true, icon: DollarSign, color: 'indigo' },
            { label: 'Total Assets', value: fmt(nw.assets), change: 'This month', up: true, icon: TrendingUp, color: 'emerald' },
            { label: 'Liabilities', value: fmt(nw.liabilities), change: 'Credit card', up: false, icon: TrendingDown, color: 'rose' },
            { label: 'Monthly Saved', value: fmt(income - spent), change: 'Income − Spent', up: true, icon: ArrowUpRight, color: 'violet' },
          ].map(stat => (
            <div key={stat.label} className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${
                stat.color === 'indigo' ? 'bg-indigo-50' :
                stat.color === 'emerald' ? 'bg-emerald-50' :
                stat.color === 'rose' ? 'bg-rose-50' : 'bg-violet-50'
              }`}>
                <stat.icon size={18} className={
                  stat.color === 'indigo' ? 'text-indigo-600' :
                  stat.color === 'emerald' ? 'text-emerald-600' :
                  stat.color === 'rose' ? 'text-rose-600' : 'text-violet-600'
                } />
              </div>
              <p className="text-2xl font-bold text-slate-900">{stat.value}</p>
              <p className="text-sm text-slate-500 mt-0.5">{stat.label}</p>
              <p className={`text-xs mt-1 font-medium ${stat.up ? 'text-emerald-600' : 'text-rose-600'}`}>{stat.change}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-6">
          {/* Net worth chart */}
          <div className="col-span-2 bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900 mb-4">Net Worth Trend</h2>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={history}>
                <defs>
                  <linearGradient id="nwGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366F1" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#6366F1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="snapshot_date" tick={{ fontSize: 11, fill: '#94A3B8' }} />
                <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => [fmtFull(v), 'Net Worth']} />
                <Area type="monotone" dataKey="net_worth" stroke="#6366F1" strokeWidth={2.5} fill="url(#nwGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Budget overview */}
          <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900 mb-4">Budget Health</h2>
            <div className="space-y-3">
              {budgets.map(b => {
                const pct = Math.min(((b as any).spent || 0) / b.amount_limit * 100, 100)
                const over = ((b as any).spent || 0) > b.amount_limit
                return (
                  <div key={b.id}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-600 font-medium">{b.category}</span>
                      <span className={over ? 'text-rose-600 font-semibold' : 'text-slate-500'}>
                        {Math.round(pct)}%
                      </span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${over ? 'bg-rose-500' : pct > 80 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Recent transactions */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="text-base font-semibold text-slate-900">Recent Transactions</h2>
          </div>
          <div className="divide-y divide-slate-50">
            {txns.slice(0, 6).map(txn => (
              <div key={txn.id} className="px-6 py-3.5 flex items-center gap-4">
                <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                  <span className="text-base">{getCategoryEmoji(txn.category)}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">{txn.name}</p>
                  <p className="text-xs text-slate-400">{txn.category} · {txn.date}</p>
                </div>
                {txn.is_pending && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-medium">Pending</span>
                )}
                <p className={`text-sm font-semibold tabular-nums ${txn.amount < 0 ? 'text-emerald-600' : 'text-slate-900'}`}>
                  {txn.amount < 0 ? '+' : '-'}{fmtFull(Math.abs(txn.amount))}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  )
}

function getCategoryEmoji(cat: string) {
  const map: Record<string, string> = {
    Groceries: '🛒', Entertainment: '🎬', Income: '💼', Transport: '🚗',
    Coffee: '☕', Shopping: '📦', Housing: '🏠', Utilities: '⚡',
    Health: '💊', Food: '🍔',
  }
  return map[cat] || '💳'
}
