'use client'
import { useEffect, useState } from 'react'
import AppShell from '@/components/layout/AppShell'
import { api, mock } from '@/lib/api'
import { Repeat2 } from 'lucide-react'

const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)

export default function RecurringPage() {
  const [recurring, setRecurring] = useState(mock.recurring)
  useEffect(() => { api.recurring.list().then(setRecurring) }, [])

  const income = recurring.filter(r => r.amount > 1000 && r.category === 'Income')
  const expenses = recurring.filter(r => !(r.amount > 1000 && r.category === 'Income'))
  const monthlyExpenses = expenses.reduce((s, r) => s + r.amount, 0)
  const monthlyIncome = income.reduce((s, r) => s + r.amount, 0)

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold text-slate-900">Recurring</h1>

        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
            <p className="text-sm text-slate-500">Monthly Income</p>
            <p className="text-2xl font-bold text-emerald-600 mt-1">{fmt(monthlyIncome)}</p>
          </div>
          <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
            <p className="text-sm text-slate-500">Monthly Expenses</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{fmt(monthlyExpenses)}</p>
          </div>
          <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
            <p className="text-sm text-slate-500">Net Monthly</p>
            <p className={`text-2xl font-bold mt-1 ${monthlyIncome - monthlyExpenses > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {fmt(monthlyIncome - monthlyExpenses)}
            </p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="text-base font-semibold text-slate-900">All Recurring</h2>
          </div>
          <div className="divide-y divide-slate-50">
            {recurring.map(r => (
              <div key={r.id} className="px-6 py-4 flex items-center gap-4">
                <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                  <Repeat2 size={15} className="text-slate-500" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-900">{r.name}</p>
                  <p className="text-xs text-slate-400">{r.category} · {r.frequency} · Next: {r.next_date}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${r.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                    {r.is_active ? 'Active' : 'Paused'}
                  </span>
                  <p className={`text-sm font-semibold tabular-nums ${r.category === 'Income' ? 'text-emerald-600' : 'text-slate-900'}`}>
                    {r.category === 'Income' ? '+' : '-'}{fmt(r.amount)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  )
}
