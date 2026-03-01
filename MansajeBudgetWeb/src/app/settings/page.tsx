'use client'
import AppShell from '@/components/layout/AppShell'
import { User, Bell, Shield, Download, Trash2 } from 'lucide-react'

export default function SettingsPage() {
  return (
    <AppShell>
      <div className="max-w-2xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>

        {[
          {
            title: 'Profile',
            Icon: User,
            items: [
              { label: 'Display Name', value: 'Alex Rivera', action: 'Edit' },
              { label: 'Email', value: 'alex@example.com', action: 'Edit' },
            ]
          },
          {
            title: 'Notifications',
            Icon: Bell,
            items: [
              { label: 'Budget alerts', value: 'On', action: 'Toggle' },
              { label: 'Weekly summary', value: 'On', action: 'Toggle' },
              { label: 'Large transactions', value: 'Off', action: 'Toggle' },
            ]
          },
          {
            title: 'Security',
            Icon: Shield,
            items: [
              { label: 'Two-factor auth', value: 'Enabled', action: 'Manage' },
            ]
          },
        ].map(section => (
          <div key={section.title} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
              <section.Icon size={16} className="text-slate-400" />
              <h2 className="text-sm font-semibold text-slate-900">{section.title}</h2>
            </div>
            <div className="divide-y divide-slate-50">
              {section.items.map(item => (
                <div key={item.label} className="px-6 py-4 flex items-center justify-between">
                  <span className="text-sm text-slate-700">{item.label}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-slate-400">{item.value}</span>
                    <button className="text-sm text-indigo-600 font-medium hover:text-indigo-700">{item.action}</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
            <Download size={16} className="text-slate-400" />
            <h2 className="text-sm font-semibold text-slate-900">Data</h2>
          </div>
          <div className="px-6 py-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-700">Export transactions</p>
              <p className="text-xs text-slate-400">Download as CSV</p>
            </div>
            <button className="text-sm text-indigo-600 font-medium hover:text-indigo-700">Export</button>
          </div>
          <div className="px-6 py-4 flex items-center justify-between border-t border-slate-50">
            <div>
              <p className="text-sm text-rose-600 font-medium">Delete account</p>
              <p className="text-xs text-slate-400">This cannot be undone</p>
            </div>
            <button className="flex items-center gap-1.5 text-sm text-rose-600 font-medium hover:text-rose-700">
              <Trash2 size={14} /> Delete
            </button>
          </div>
        </div>
      </div>
    </AppShell>
  )
}
