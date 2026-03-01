'use client'
import { useEffect, useState } from 'react'
import AppShell from '@/components/layout/AppShell'
import { api, mock } from '@/lib/api'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

const fmtFull = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n)

export default function WealthPage() {
  const [nw, setNw] = useState(mock.netWorth)
  const [history, setHistory] = useState(mock.netWorthHistory)

  useEffect(() => {
    api.wealth.netWorth().then(setNw)
    api.wealth.history().then(setHistory)
  }, [])

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold text-slate-900">Net Worth</h1>

        <div className="bg-gradient-to-br from-slate-900 to-indigo-950 rounded-2xl p-8 text-white">
          <p className="text-slate-400 text-sm mb-1">Total Net Worth</p>
          <p className="text-5xl font-bold mb-1">{fmtFull(nw.net_worth)}</p>
          <p className="text-emerald-400 text-sm font-medium">↑ +$1,247 this month (+2.7%)</p>
          <div className="mt-6 h-32">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={history}>
                <defs>
                  <linearGradient id="wealthGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#818CF8" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#818CF8" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="snapshot_date" hide />
                <Tooltip formatter={(v: number) => [fmtFull(v), '']} contentStyle={{ background: '#1E293B', border: 'none', borderRadius: 8, color: '#F1F5F9' }} />
                <Area type="monotone" dataKey="net_worth" stroke="#818CF8" strokeWidth={2.5} fill="url(#wealthGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
            <p className="text-sm text-slate-500 mb-1">Total Assets</p>
            <p className="text-2xl font-bold text-emerald-600">{fmtFull(nw.assets)}</p>
            <div className="mt-4 space-y-2">
              <div className="flex justify-between text-sm"><span className="text-slate-500">Checking</span><span className="font-medium">$4,821</span></div>
              <div className="flex justify-between text-sm"><span className="text-slate-500">Savings</span><span className="font-medium">$18,492</span></div>
              <div className="flex justify-between text-sm"><span className="text-slate-500">Investments</span><span className="font-medium">$26,120</span></div>
            </div>
          </div>
          <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
            <p className="text-sm text-slate-500 mb-1">Liabilities</p>
            <p className="text-2xl font-bold text-rose-600">{fmtFull(nw.liabilities)}</p>
            <div className="mt-4 space-y-2">
              <div className="flex justify-between text-sm"><span className="text-slate-500">Credit Cards</span><span className="font-medium text-rose-600">$2,150</span></div>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  )
}
