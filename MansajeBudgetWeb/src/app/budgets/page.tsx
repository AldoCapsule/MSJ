'use client'
import { useEffect, useState } from 'react'
import AppShell from '@/components/layout/AppShell'
import { api, mock } from '@/lib/api'

const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n)

const COLORS = ['#6366F1', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#14B8A6']
const EMOJIS: Record<string, string> = {
  'Food & Dining': '🍔', Transport: '🚗', Entertainment: '🎬',
  Shopping: '🛍️', Housing: '🏠', Health: '💊', Coffee: '☕', Utilities: '⚡'
}

export default function BudgetsPage() {
  const [budgets, setBudgets] = useState(mock.budgets)
  const now = new Date()

  useEffect(() => {
    api.budgets.list(now.getMonth() + 1, now.getFullYear()).then(setBudgets)
  }, [])

  const totalBudget = budgets.reduce((s, b) => s + b.amount_limit, 0)
  const totalSpent = budgets.reduce((s, b) => s + ((b as any).spent || 0), 0)

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Budgets</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {now.toLocaleString('default', { month: 'long', year: 'numeric' })}
          </p>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
            <p className="text-sm text-slate-500">Total Budget</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{fmt(totalBudget)}</p>
          </div>
          <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
            <p className="text-sm text-slate-500">Spent</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{fmt(totalSpent)}</p>
          </div>
          <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
            <p className="text-sm text-slate-500">Remaining</p>
            <p className={`text-2xl font-bold mt-1 ${totalSpent > totalBudget ? 'text-rose-600' : 'text-emerald-600'}`}>
              {fmt(totalBudget - totalSpent)}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {budgets.map((b, i) => {
            const spent = (b as any).spent || 0
            const pct = Math.min(spent / b.amount_limit, 1)
            const over = spent > b.amount_limit
            const color = COLORS[i % COLORS.length]
            return (
              <div key={b.id} className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl bg-slate-100">
                    {EMOJIS[b.category] || '💳'}
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900">{b.category}</p>
                    <p className="text-xs text-slate-500">{fmt(spent)} of {fmt(b.amount_limit)}</p>
                  </div>
                  {over && (
                    <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-rose-50 text-rose-600 font-semibold">Over</span>
                  )}
                </div>
                <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${pct * 100}%`, backgroundColor: over ? '#EF4444' : color }}
                  />
                </div>
                <div className="flex justify-between mt-2">
                  <span className="text-xs text-slate-400">{Math.round(pct * 100)}% used</span>
                  <span className={`text-xs font-medium ${over ? 'text-rose-600' : 'text-slate-500'}`}>
                    {over ? `${fmt(spent - b.amount_limit)} over` : `${fmt(b.amount_limit - spent)} left`}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </AppShell>
  )
}
