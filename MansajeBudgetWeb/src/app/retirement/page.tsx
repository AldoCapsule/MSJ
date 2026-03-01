'use client'
import { useEffect, useState } from 'react'
import AppShell from '@/components/layout/AppShell'
import { api, mock } from '@/lib/api'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'

const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n)

function buildProjection(currentAge: number, retirementAge: number, currentSavings: number, monthlyContribution: number, annualReturn: number) {
  const data = []
  let balance = currentSavings
  const monthlyRate = annualReturn / 12
  for (let age = currentAge; age <= retirementAge; age++) {
    data.push({ age, balance: Math.round(balance) })
    for (let m = 0; m < 12; m++) {
      balance = balance * (1 + monthlyRate) + monthlyContribution
    }
  }
  return data
}

export default function RetirementPage() {
  const [proj, setProj] = useState(mock.retirement)
  const [editing, setEditing] = useState(false)

  useEffect(() => { api.wealth.retirement().then(d => { if (d) setProj(d) }) }, [])

  const chartData = buildProjection(proj.current_age, proj.retirement_age, proj.current_savings, proj.monthly_contribution, proj.expected_annual_return)
  const projected = chartData[chartData.length - 1]?.balance || 0
  const yearsToGo = proj.retirement_age - proj.current_age
  const onTrack = projected >= (proj.target_amount || 0)

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold text-slate-900">Retirement Planner</h1>

        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
            <p className="text-sm text-slate-500">Projected at {proj.retirement_age}</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{fmt(projected)}</p>
          </div>
          <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
            <p className="text-sm text-slate-500">Target</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{fmt(proj.target_amount || 2000000)}</p>
          </div>
          <div className={`rounded-2xl p-5 border shadow-sm ${onTrack ? 'bg-emerald-50 border-emerald-100' : 'bg-rose-50 border-rose-100'}`}>
            <p className="text-sm text-slate-500">Status</p>
            <p className={`text-xl font-bold mt-1 ${onTrack ? 'text-emerald-700' : 'text-rose-700'}`}>
              {onTrack ? '✅ On Track' : '⚠️ Gap'}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">{yearsToGo} years to go</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900 mb-4">Projected Growth</h2>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="retGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366F1" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#6366F1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="age" tick={{ fontSize: 11, fill: '#94A3B8' }} tickFormatter={v => `${v}`} />
              <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} tickFormatter={v => `$${(v/1000000).toFixed(1)}M`} />
              <Tooltip formatter={(v: number) => [fmt(v), 'Balance']} labelFormatter={v => `Age ${v}`} />
              {proj.target_amount && <ReferenceLine y={proj.target_amount} stroke="#10B981" strokeDasharray="4 4" label={{ value: 'Target', fill: '#10B981', fontSize: 11 }} />}
              <Area type="monotone" dataKey="balance" stroke="#6366F1" strokeWidth={2.5} fill="url(#retGrad)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900 mb-4">Assumptions</h2>
          <div className="grid grid-cols-2 gap-4">
            {[
              { label: 'Current Age', value: `${proj.current_age} years` },
              { label: 'Retirement Age', value: `${proj.retirement_age} years` },
              { label: 'Current Savings', value: fmt(proj.current_savings) },
              { label: 'Monthly Contribution', value: fmt(proj.monthly_contribution) },
              { label: 'Expected Annual Return', value: `${(proj.expected_annual_return * 100).toFixed(1)}%` },
              { label: 'Target Amount', value: fmt(proj.target_amount || 2000000) },
            ].map(item => (
              <div key={item.label} className="flex justify-between py-2 border-b border-slate-50">
                <span className="text-sm text-slate-500">{item.label}</span>
                <span className="text-sm font-semibold text-slate-900">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  )
}
