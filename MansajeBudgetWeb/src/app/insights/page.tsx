'use client'
import { useEffect, useState } from 'react'
import AppShell from '@/components/layout/AppShell'
import { api, mock } from '@/lib/api'
import { Lightbulb } from 'lucide-react'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export default function InsightsPage() {
  const [insights, setInsights] = useState(mock.insights)
  useEffect(() => { api.insights.list().then(setInsights) }, [])

  return (
    <AppShell>
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center">
            <Lightbulb size={18} className="text-violet-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">AI Insights</h1>
            <p className="text-slate-500 text-sm">Powered by Claude</p>
          </div>
        </div>

        <div className="space-y-4">
          {insights.map(insight => (
            <div key={insight.id} className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-slate-900">
                  {MONTHS[insight.month - 1]} {insight.year}
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-violet-50 text-violet-600 font-medium">
                  {insight.model}
                </span>
              </div>
              <p className="text-sm text-slate-700 leading-relaxed">{insight.content}</p>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  )
}
