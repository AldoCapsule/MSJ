'use client'
import { useEffect, useState } from 'react'
import AppShell from '@/components/layout/AppShell'
import { api } from '@/lib/api'
import { PieChart, Pie, Cell, Tooltip, BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Legend } from 'recharts'

const COLORS = ['#6366F1','#10B981','#F59E0B','#EF4444','#8B5CF6','#14B8A6','#F97316','#06B6D4']
const fmt = (n: number) => `$${(n / 1000).toFixed(1)}k`

const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function getPast6Months() {
  const months: string[] = []
  const d = new Date()
  for (let i = 5; i >= 0; i--) {
    const t = new Date(d.getFullYear(), d.getMonth() - i, 1)
    months.push(`${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`)
  }
  return months
}

export default function ReportsPage() {
  const [categoryData, setCategoryData] = useState<{ name: string; value: number }[]>([])
  const [monthlyData, setMonthlyData] = useState<{ month: string; income: number; expenses: number }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const months = getPast6Months()

    Promise.all([
      // Current month spending by category
      api.reports.spending(`group_by=category&granularity=month`),
      // Last 6 months cashflow
      ...months.map(m => api.reports.cashflow(m)),
    ]).then(([spending, ...cashflows]) => {
      // Latest period's breakdown → pie chart
      if ((spending as any[]).length) {
        const latest = (spending as any[]).at(-1)
        const cats = (latest?.breakdown || [])
          .map((b: any) => ({ name: b.category || 'Other', value: Math.round(b.amount || 0) }))
          .sort((a: any, b: any) => b.value - a.value)
          .slice(0, 8)
        setCategoryData(cats)
      }

      // Cashflow bar chart
      const monthly = months.map((m, i) => {
        const cf = cashflows[i] as any
        const [yr, mo] = m.split('-').map(Number)
        return {
          month: MONTH_LABELS[mo - 1],
          income: Math.round(cf?.income_total ?? 0),
          expenses: Math.round(cf?.expense_total ?? 0),
        }
      })
      setMonthlyData(monthly)
      setLoading(false)
    })
  }, [])

  // Fallback static data while loading
  const catDisplay = categoryData.length ? categoryData : [
    { name: 'Housing', value: 1800 },
    { name: 'Food & Dining', value: 487 },
    { name: 'Transport', value: 135 },
    { name: 'Entertainment', value: 185 },
    { name: 'Shopping', value: 94 },
    { name: 'Utilities', value: 94 },
  ]
  const monthDisplay = monthlyData.length ? monthlyData : [
    { month: 'Sep', income: 4200, expenses: 3100 },
    { month: 'Oct', income: 4200, expenses: 3400 },
    { month: 'Nov', income: 4200, expenses: 2900 },
    { month: 'Dec', income: 4500, expenses: 3800 },
    { month: 'Jan', income: 4200, expenses: 3000 },
    { month: 'Feb', income: 4200, expenses: 2878 },
  ]

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-slate-900">Reports</h1>
          {loading && <span className="text-xs text-slate-400 animate-pulse">Loading live data…</span>}
        </div>

        <div className="grid grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900 mb-4">Spending by Category</h2>
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={catDisplay} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={3} dataKey="value">
                  {catDisplay.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => [`$${v}`, '']} />
                <Legend formatter={(v) => <span style={{ fontSize: 12, color: '#64748B' }}>{v}</span>} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900 mb-4">Income vs Expenses</h2>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={monthDisplay} barGap={4}>
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94A3B8' }} />
                <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} tickFormatter={fmt} />
                <Tooltip formatter={(v: number) => [`$${v}`, '']} />
                <Bar dataKey="income" fill="#10B981" radius={[4,4,0,0]} name="Income" />
                <Bar dataKey="expenses" fill="#6366F1" radius={[4,4,0,0]} name="Expenses" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </AppShell>
  )
}
