'use client'
import { useEffect, useState } from 'react'
import AppShell from '@/components/layout/AppShell'
import { api, mock } from '@/lib/api'
import { Search, Filter } from 'lucide-react'

const fmtFull = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)

function getCategoryEmoji(cat: string) {
  const map: Record<string, string> = {
    Groceries: '🛒', Entertainment: '🎬', Income: '💼', Transport: '🚗',
    Coffee: '☕', Shopping: '📦', Housing: '🏠', Utilities: '⚡',
    Health: '💊', Food: '🍔',
  }
  return map[cat] || '💳'
}

export default function TransactionsPage() {
  const [txns, setTxns] = useState(mock.transactions)
  const [search, setSearch] = useState('')

  useEffect(() => { api.transactions.list().then(setTxns) }, [])

  const filtered = txns.filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.category.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Transactions</h1>
            <p className="text-slate-500 text-sm mt-0.5">{txns.length} transactions</p>
          </div>
        </div>

        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search transactions..."
              className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
            />
          </div>
          <button className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-600 hover:bg-slate-50 transition">
            <Filter size={15} /> Filter
          </button>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="divide-y divide-slate-50">
            {filtered.map(txn => (
              <div key={txn.id} className="px-6 py-4 flex items-center gap-4 hover:bg-slate-50 transition">
                <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center shrink-0 text-lg">
                  {getCategoryEmoji(txn.category)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900">{txn.name}</p>
                  <p className="text-xs text-slate-400">{txn.category} · {txn.date}</p>
                </div>
                <div className="flex items-center gap-3">
                  {txn.is_pending && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-medium">Pending</span>
                  )}
                  <p className={`text-sm font-semibold tabular-nums ${txn.amount < 0 ? 'text-emerald-600' : 'text-slate-900'}`}>
                    {txn.amount < 0 ? '+' : '-'}{fmtFull(Math.abs(txn.amount))}
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
