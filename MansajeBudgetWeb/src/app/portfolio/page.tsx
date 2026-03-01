'use client'
import { useEffect, useState } from 'react'
import AppShell from '@/components/layout/AppShell'
import { api, mock } from '@/lib/api'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { TrendingUp, TrendingDown } from 'lucide-react'

const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
const COLORS = ['#6366F1','#10B981','#F59E0B','#EF4444']

export default function PortfolioPage() {
  const [holdings, setHoldings] = useState(mock.holdings)

  useEffect(() => {
    api.wealth.portfolio().then(d => { if (d.holdings?.length) setHoldings(d.holdings) })
  }, [])

  const totalValue = holdings.reduce((s, h) => s + h.institution_value, 0)
  const totalCost = holdings.reduce((s, h) => s + h.cost_basis, 0)
  const totalGain = totalValue - totalCost
  const totalGainPct = (totalGain / totalCost) * 100

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold text-slate-900">Portfolio</h1>

        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
            <p className="text-sm text-slate-500">Market Value</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{fmt(totalValue)}</p>
          </div>
          <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
            <p className="text-sm text-slate-500">Total Gain/Loss</p>
            <p className={`text-2xl font-bold mt-1 ${totalGain >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {totalGain >= 0 ? '+' : ''}{fmt(totalGain)}
            </p>
          </div>
          <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
            <p className="text-sm text-slate-500">Return</p>
            <div className={`flex items-center gap-1 mt-1 ${totalGainPct >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {totalGainPct >= 0 ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
              <p className="text-2xl font-bold">{totalGainPct >= 0 ? '+' : ''}{totalGainPct.toFixed(1)}%</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-5 gap-6">
          <div className="col-span-2 bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900 mb-4">Allocation</h2>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={holdings} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={3} dataKey="institution_value" nameKey="ticker">
                  {holdings.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v: number) => [fmt(v), '']} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="col-span-3 bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <h2 className="text-base font-semibold text-slate-900">Holdings</h2>
            </div>
            <div className="divide-y divide-slate-50">
              {holdings.map((h, i) => {
                const gain = h.institution_value - h.cost_basis
                const gainPct = (gain / h.cost_basis) * 100
                return (
                  <div key={h.security_id} className="px-6 py-4 flex items-center gap-4">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-xs font-bold text-white" style={{ background: COLORS[i % COLORS.length] }}>
                      {h.ticker?.slice(0,3)}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-slate-900">{h.name}</p>
                      <p className="text-xs text-slate-400">{h.quantity} shares · {h.ticker}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-slate-900 tabular-nums">{fmt(h.institution_value)}</p>
                      <p className={`text-xs font-medium tabular-nums ${gain >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {gain >= 0 ? '+' : ''}{fmt(gain)} ({gainPct >= 0 ? '+' : ''}{gainPct.toFixed(1)}%)
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  )
}
