'use client'
import { useEffect, useState } from 'react'
import AppShell from '@/components/layout/AppShell'
import { api, mock } from '@/lib/api'
import { CreditCard, TrendingUp, Banknote, PiggyBank, Plus } from 'lucide-react'

const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)

const typeConfig: Record<string, { label: string; Icon: any; color: string; bg: string }> = {
  checking: { label: 'Checking', Icon: Banknote, color: 'text-blue-600', bg: 'bg-blue-50' },
  savings: { label: 'Savings', Icon: PiggyBank, color: 'text-emerald-600', bg: 'bg-emerald-50' },
  credit: { label: 'Credit', Icon: CreditCard, color: 'text-rose-600', bg: 'bg-rose-50' },
  investment: { label: 'Investment', Icon: TrendingUp, color: 'text-violet-600', bg: 'bg-violet-50' },
}

export default function AccountsPage() {
  const [accounts, setAccounts] = useState(mock.accounts)
  useEffect(() => { api.accounts.list().then(setAccounts) }, [])

  const assets = accounts.filter(a => ['checking','savings','investment'].includes(a.type)).reduce((s, a) => s + a.current_balance, 0)
  const liabilities = accounts.filter(a => a.type === 'credit').reduce((s, a) => s + a.current_balance, 0)

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Accounts</h1>
            <p className="text-slate-500 text-sm mt-0.5">{accounts.length} connected accounts</p>
          </div>
          <button className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition">
            <Plus size={16} /> Connect Bank
          </button>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
            <p className="text-sm text-slate-500">Total Assets</p>
            <p className="text-2xl font-bold text-emerald-600 mt-1">{fmt(assets)}</p>
          </div>
          <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
            <p className="text-sm text-slate-500">Liabilities</p>
            <p className="text-2xl font-bold text-rose-600 mt-1">{fmt(liabilities)}</p>
          </div>
          <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
            <p className="text-sm text-slate-500">Net</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{fmt(assets - liabilities)}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {accounts.map(acct => {
            const cfg = typeConfig[acct.type] || typeConfig.checking
            return (
              <div key={acct.id} className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm hover:shadow-md transition">
                <div className="flex items-center gap-3 mb-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${cfg.bg}`}>
                    <cfg.Icon size={18} className={cfg.color} />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900">{acct.name}</p>
                    <p className="text-xs text-slate-400">{acct.institution_name} ···{acct.mask}</p>
                  </div>
                  <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium capitalize">{cfg.label}</span>
                </div>
                <p className={`text-2xl font-bold tabular-nums ${acct.type === 'credit' ? 'text-rose-600' : 'text-slate-900'}`}>
                  {acct.type === 'credit' ? '-' : ''}{fmt(acct.current_balance)}
                </p>
                <p className="text-xs text-slate-400 mt-1">Current balance</p>
              </div>
            )
          })}
        </div>
      </div>
    </AppShell>
  )
}
