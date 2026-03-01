'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, ArrowLeftRight, PiggyBank, Landmark,
  Target, BarChart3, TrendingUp, Briefcase, Calculator,
  Lightbulb, Repeat2, Settings,
} from 'lucide-react'

const nav = [
  { href: '/dashboard',    label: 'Dashboard',    Icon: LayoutDashboard },
  { href: '/transactions', label: 'Transactions', Icon: ArrowLeftRight },
  { href: '/budgets',      label: 'Budgets',      Icon: PiggyBank },
  { href: '/accounts',     label: 'Accounts',     Icon: Landmark },
  { href: '/goals',        label: 'Goals',        Icon: Target },
  { href: '/reports',      label: 'Reports',      Icon: BarChart3 },
  null, // divider
  { href: '/wealth',       label: 'Net Worth',    Icon: TrendingUp },
  { href: '/portfolio',    label: 'Portfolio',    Icon: Briefcase },
  { href: '/retirement',   label: 'Retirement',   Icon: Calculator },
  null, // divider
  { href: '/insights',     label: 'Insights',     Icon: Lightbulb },
  { href: '/recurring',    label: 'Recurring',    Icon: Repeat2 },
  { href: '/settings',     label: 'Settings',     Icon: Settings },
]

export default function Sidebar() {
  const path = usePathname()
  return (
    <aside className="w-56 bg-slate-900 flex flex-col py-5 px-3 gap-0.5 shrink-0 h-screen sticky top-0">
      <div className="px-3 mb-5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-indigo-500 flex items-center justify-center shrink-0">
            <span className="text-white font-bold text-sm">M</span>
          </div>
          <div>
            <p className="text-white font-semibold text-sm leading-tight">Mansaje</p>
            <p className="text-slate-400 text-xs">Budget</p>
          </div>
        </div>
      </div>

      {nav.map((item, i) =>
        item === null ? (
          <div key={i} className="my-2 border-t border-slate-800" />
        ) : (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
              path === item.href
                ? 'bg-indigo-600 text-white'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <item.Icon size={16} strokeWidth={2} />
            {item.label}
          </Link>
        )
      )}

      <div className="mt-auto px-3 py-3 border-t border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-700 to-slate-600 flex items-center justify-center">
            <span className="text-white text-xs font-bold">AR</span>
          </div>
          <div>
            <p className="text-white text-xs font-medium">Alex Rivera</p>
            <p className="text-slate-500 text-xs">Dev mode</p>
          </div>
        </div>
      </div>
    </aside>
  )
}
