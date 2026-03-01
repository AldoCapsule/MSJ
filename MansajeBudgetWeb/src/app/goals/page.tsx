'use client'
import { useEffect, useState } from 'react'
import AppShell from '@/components/layout/AppShell'
import { api, mock } from '@/lib/api'
import { CheckCircle2 } from 'lucide-react'

const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n)

const EMOJIS: Record<string, string> = {
  'Emergency Fund': '🛡️', 'Vacation': '✈️', 'MacBook': '💻', 'Car': '🚗', 'House': '🏠'
}

function getEmoji(name: string) {
  return Object.entries(EMOJIS).find(([k]) => name.includes(k))?.[1] || '🎯'
}

export default function GoalsPage() {
  const [goals, setGoals] = useState(mock.goals)
  useEffect(() => { api.goals.list().then(setGoals) }, [])

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold text-slate-900">Goals</h1>

        <div className="grid grid-cols-2 gap-4">
          {goals.map(goal => {
            const pct = Math.min(goal.current_amount / goal.target_amount * 100, 100)
            return (
              <div key={goal.id} className={`bg-white rounded-2xl p-5 border shadow-sm ${goal.is_completed ? 'border-emerald-200' : 'border-slate-100'}`}>
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-3xl">{getEmoji(goal.name)}</span>
                  <div className="flex-1">
                    <p className="font-semibold text-slate-900">{goal.name}</p>
                    <p className="text-xs text-slate-400">Target: {goal.target_date}</p>
                  </div>
                  {goal.is_completed && <CheckCircle2 size={20} className="text-emerald-500 shrink-0" />}
                </div>

                <div className="mb-3">
                  <div className="flex justify-between text-sm mb-1.5">
                    <span className="text-slate-600 font-medium">{fmt(goal.current_amount)}</span>
                    <span className="text-slate-400">{fmt(goal.target_amount)}</span>
                  </div>
                  <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${goal.is_completed ? 'bg-emerald-500' : 'bg-indigo-500'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="text-xs text-slate-400 mt-1.5">{Math.round(pct)}% complete</p>
                </div>

                {!goal.is_completed && (
                  <p className="text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2">
                    {fmt(goal.target_amount - goal.current_amount)} remaining
                  </p>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </AppShell>
  )
}
