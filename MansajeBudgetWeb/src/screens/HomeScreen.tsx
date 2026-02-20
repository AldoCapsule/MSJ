'use client'

import React, { useState } from 'react'
import { motion } from 'framer-motion'
import {
  Bell, ChevronRight, Plus, ArrowUpRight, ArrowDownRight,
  CreditCard, TrendingUp, Repeat, Home, Wallet, Zap,
  LayoutGrid, Eye, EyeOff,
} from 'lucide-react'
import {
  AreaChart, Area, ResponsiveContainer, Tooltip, XAxis,
} from 'recharts'

// ─── Types ───────────────────────────────────────────────────────────────────

type AccountType = 'checking' | 'savings' | 'credit' | 'investment'

interface Account {
  id: number
  name: string
  institution: string
  balance: number
  type: AccountType
  last4: string
}

interface Budget {
  id: number
  category: string
  emoji: string
  spent: number
  limit: number
  color: string
}

interface Transaction {
  id: number
  name: string
  category: string
  emoji: string
  amount: number
  date: string
  pending: boolean
  recurring: boolean
}

interface Upcoming {
  id: number
  name: string
  emoji: string
  amount: number
  daysUntil: number
  cadence: string
}

// ─── Mock Data ───────────────────────────────────────────────────────────────

const sparklineData = [
  { m: 'Aug', v: 41200 },
  { m: 'Sep', v: 42800 },
  { m: 'Oct', v: 41900 },
  { m: 'Nov', v: 44100 },
  { m: 'Dec', v: 43600 },
  { m: 'Jan', v: 45200 },
  { m: 'Feb', v: 47284 },
]

const accounts: Account[] = [
  { id: 1, name: 'Checking', institution: 'Chase', balance: 4821.33, type: 'checking', last4: '4521' },
  { id: 2, name: 'High-Yield Savings', institution: 'Marcus', balance: 18492.00, type: 'savings', last4: '8832' },
  { id: 3, name: 'Sapphire Reserve', institution: 'Chase', balance: -2149.87, type: 'credit', last4: '9041' },
  { id: 4, name: 'Brokerage', institution: 'Fidelity', balance: 26120.06, type: 'investment', last4: '3302' },
]

const budgets: Budget[] = [
  { id: 1, category: 'Food & Dining', emoji: '🍔', spent: 487, limit: 600, color: '#10B981' },
  { id: 2, category: 'Transport', emoji: '🚗', spent: 112, limit: 250, color: '#3B82F6' },
  { id: 3, category: 'Entertainment', emoji: '🎬', spent: 185, limit: 200, color: '#EF4444' },
  { id: 4, category: 'Shopping', emoji: '🛍️', spent: 94, limit: 300, color: '#14B8A6' },
]

const transactions: Transaction[] = [
  { id: 1, name: 'Whole Foods', category: 'Groceries', emoji: '🛒', amount: -86.42, date: 'Today', pending: false, recurring: false },
  { id: 2, name: 'Netflix', category: 'Entertainment', emoji: '🎬', amount: -15.99, date: 'Today', pending: false, recurring: true },
  { id: 3, name: 'Payroll Deposit', category: 'Income', emoji: '💼', amount: 4200.00, date: 'Yesterday', pending: false, recurring: true },
  { id: 4, name: 'Uber', category: 'Transport', emoji: '🚗', amount: -23.10, date: 'Yesterday', pending: true, recurring: false },
  { id: 5, name: 'Starbucks', category: 'Coffee', emoji: '☕', amount: -6.75, date: 'Feb 18', pending: false, recurring: false },
  { id: 6, name: 'Amazon', category: 'Shopping', emoji: '📦', amount: -54.99, date: 'Feb 18', pending: false, recurring: false },
]

const upcoming: Upcoming[] = [
  { id: 1, name: 'Rent', emoji: '🏠', amount: 1800.00, daysUntil: 8, cadence: 'Monthly' },
  { id: 2, name: 'Spotify', emoji: '🎵', amount: 9.99, daysUntil: 12, cadence: 'Monthly' },
  { id: 3, name: 'Planet Fitness', emoji: '💪', amount: 24.99, daysUntil: 19, cadence: 'Monthly' },
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(Math.abs(n))

const accountGradient: Record<AccountType, string> = {
  checking: 'from-[#1E293B] to-[#334155]',
  savings: 'from-[#0F766E] to-[#14B8A6]',
  credit: 'from-[#1F2937] to-[#374151]',
  investment: 'from-[#1D4ED8] to-[#3B82F6]',
}

const dueColor = (days: number) => {
  if (days <= 3) return 'text-[#EF4444]'
  if (days <= 7) return 'text-[#F59E0B]'
  return 'text-[#6B7280]'
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBar() {
  return (
    <div className="px-8 pt-4 pb-1 flex justify-between items-center bg-white">
      <span className="text-sm font-semibold text-[#1E293B]">9:41</span>
      <div className="flex items-center gap-1.5 text-[#1E293B]">
        {/* Signal bars */}
        <svg width="17" height="12" viewBox="0 0 17 12" fill="none">
          <rect x="0" y="5" width="3" height="7" rx="1" fill="currentColor" opacity="0.3" />
          <rect x="4.5" y="3" width="3" height="9" rx="1" fill="currentColor" opacity="0.6" />
          <rect x="9" y="0" width="3" height="12" rx="1" fill="currentColor" />
        </svg>
        {/* Wifi */}
        <svg width="16" height="11" viewBox="0 0 16 11" fill="none">
          <path d="M8 4.4C9.9 4.4 11.6 5.2 12.8 6.5L14 5.4C12.5 3.7 10.4 2.8 8 2.8S3.5 3.7 2 5.4L3.2 6.5C4.4 5.2 6.1 4.4 8 4.4Z" fill="currentColor" opacity="0.5" />
          <path d="M8 7.6C9.1 7.6 10 8 10.7 8.7L8 11L5.3 8.7C6 8 6.9 7.6 8 7.6Z" fill="currentColor" />
          <path d="M8 1.2C10.9 1.2 13.5 2.4 15.3 4.4L16 3.6C14 1.4 11.2.2 8 .2S2 1.4 0 3.6L.7 4.4C2.5 2.4 5.1 1.2 8 1.2Z" fill="currentColor" opacity="0.2" />
        </svg>
        {/* Battery */}
        <div className="flex items-center gap-0.5">
          <div className="w-6 h-3 rounded-[3px] border border-current relative flex items-center px-[2px]">
            <div className="h-[7px] w-[80%] bg-current rounded-[1px]" />
          </div>
          <div className="w-[3px] h-[5px] bg-current rounded-r-[1px] opacity-50" />
        </div>
      </div>
    </div>
  )
}

function SectionHeader({
  title,
  badge,
  onViewAll,
}: {
  title: string
  badge?: string
  onViewAll?: () => void
}) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-sm font-semibold text-[#1E293B]">{title}</h2>
      {badge ? (
        <span className="text-[10px] px-2 py-0.5 rounded bg-gray-100 text-[#6B7280] font-medium">{badge}</span>
      ) : (
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={onViewAll}
          className="flex items-center gap-0.5 text-xs text-[#6B7280] active:text-[#1E293B] transition-colors"
        >
          <span>View all</span>
          <ChevronRight size={13} />
        </motion.button>
      )}
    </div>
  )
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const [balanceVisible, setBalanceVisible] = useState(true)
  const [activeTab, setActiveTab] = useState<'home' | 'transactions' | 'budget' | 'goals' | 'more'>('home')

  const totalNetWorth = accounts.reduce((sum, a) => sum + a.balance, 0)
  const monthlyIncome = transactions.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0)
  const monthlySpent = transactions.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0)
  const monthlySaved = monthlyIncome - monthlySpent

  return (
    <div className="min-h-screen bg-gray-300 flex items-center justify-center p-8 font-sans">
      {/* ── iPhone Frame ── */}
      <div
        className="relative flex flex-col bg-white overflow-hidden shadow-2xl"
        style={{
          width: 390,
          minHeight: 844,
          borderRadius: 40,
          fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', sans-serif",
        }}
      >
        <StatusBar />

        {/* ── Scrollable body ── */}
        <div
          className="flex-1 overflow-y-auto"
          style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
        >
          {/* STICKY HEADER */}
          <div className="sticky top-0 bg-white z-10 px-6 pt-4 pb-4 border-b border-[#E5E7EB]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-[#6B7280] font-medium leading-tight">Good morning,</p>
                <h1 className="text-lg font-semibold text-[#1E293B] leading-tight">Alex Rivera</h1>
              </div>
              <div className="flex items-center gap-2">
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center relative"
                >
                  <Bell size={18} className="text-[#1E293B]" />
                  <span className="absolute top-2 right-2 w-2 h-2 bg-[#EF4444] rounded-full border-2 border-white" />
                </motion.button>
                <motion.button whileTap={{ scale: 0.95 }}>
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#1E293B] to-[#475569] flex items-center justify-center">
                    <span className="text-white text-sm font-bold">AR</span>
                  </div>
                </motion.button>
              </div>
            </div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            {/* ─────────────────────────────────────────────────────────
                SECTION 1 — NET WORTH HERO (white bg)
            ───────────────────────────────────────────────────────── */}
            <div className="bg-white px-6 pt-6 pb-6">
              <div className="bg-gradient-to-br from-[#1E293B] to-[#0f2847] rounded-2xl p-6 text-white">

                {/* Label row */}
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-white/60 font-medium tracking-wide uppercase">Total Net Worth</span>
                  <motion.button
                    whileTap={{ scale: 0.9 }}
                    onClick={() => setBalanceVisible(v => !v)}
                    className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center"
                  >
                    {balanceVisible
                      ? <Eye size={13} className="text-white/60" />
                      : <EyeOff size={13} className="text-white/60" />}
                  </motion.button>
                </div>

                {/* Balance */}
                <div className="min-h-[48px] flex items-end mb-1">
                  {balanceVisible ? (
                    <motion.p
                      key="vis"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="text-[42px] font-bold leading-none"
                      style={{ fontVariantNumeric: 'tabular-nums' }}
                    >
                      {fmt(totalNetWorth)}
                    </motion.p>
                  ) : (
                    <p className="text-[42px] font-bold leading-none tracking-widest">••••••</p>
                  )}
                </div>

                {/* MoM badge */}
                <div className="flex items-center gap-2 mb-5">
                  <div className="flex items-center gap-1 bg-[#10B981]/20 text-[#34D399] text-xs font-semibold px-2.5 py-1 rounded-full">
                    <ArrowUpRight size={11} strokeWidth={2.5} />
                    <span>+$1,247 this month</span>
                  </div>
                  <span className="text-white/40 text-xs">+2.7%</span>
                </div>

                {/* Sparkline */}
                <div className="h-[60px] -mx-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={sparklineData} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                      <defs>
                        <linearGradient id="nwGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10B981" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <Area
                        type="monotone"
                        dataKey="v"
                        stroke="#10B981"
                        strokeWidth={2.5}
                        fill="url(#nwGrad)"
                        dot={false}
                        activeDot={{ r: 3, fill: '#10B981', strokeWidth: 0 }}
                      />
                      <XAxis dataKey="m" hide />
                      <Tooltip
                        formatter={(v: number) => [`$${(v / 1000).toFixed(1)}k`, '']}
                        contentStyle={{
                          background: '#fff',
                          border: '1px solid #E5E7EB',
                          borderRadius: 8,
                          fontSize: 11,
                          color: '#1E293B',
                          padding: '4px 10px',
                          boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                        }}
                        cursor={{ stroke: 'rgba(255,255,255,0.15)', strokeWidth: 1 }}
                        itemStyle={{ color: '#10B981', fontWeight: 700 }}
                        labelStyle={{ display: 'none' }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                {/* Month labels */}
                <div className="flex justify-between mt-1 px-1">
                  {sparklineData.map(d => (
                    <span key={d.m} className="text-[9px] text-white/30">{d.m}</span>
                  ))}
                </div>
              </div>
            </div>

            {/* ─────────────────────────────────────────────────────────
                SECTION 2 — ACCOUNTS SCROLL (gray-50 bg)
            ───────────────────────────────────────────────────────── */}
            <div className="bg-gray-50 pt-6 pb-6">
              <div className="px-6">
                <SectionHeader title="Accounts" />
              </div>

              {/* Edge-to-edge horizontal scroll */}
              <div
                className="overflow-x-auto"
                style={{ scrollbarWidth: 'none' } as React.CSSProperties}
              >
                <div className="flex gap-3 px-6" style={{ width: 'max-content', paddingRight: 24 }}>
                  {accounts.map((acct, i) => (
                    <motion.button
                      key={acct.id}
                      initial={{ opacity: 0, x: 16 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.07, duration: 0.4 }}
                      whileTap={{ scale: 0.97 }}
                      className={`bg-gradient-to-br ${accountGradient[acct.type]} rounded-2xl p-4 text-white w-[152px] shrink-0 text-left`}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-[9px] text-white/50 font-semibold uppercase tracking-widest">{acct.institution}</span>
                        <CreditCard size={13} className="text-white/30" />
                      </div>
                      <p
                        className="text-[17px] font-bold leading-tight mb-2"
                        style={{ fontVariantNumeric: 'tabular-nums' }}
                      >
                        {balanceVisible ? (acct.balance < 0 ? `-${fmt(acct.balance)}` : fmt(acct.balance)) : '••••'}
                      </p>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-white/50 leading-tight max-w-[80px] truncate">{acct.name}</span>
                        <span className="text-[10px] text-white/30">••{acct.last4}</span>
                      </div>
                    </motion.button>
                  ))}

                  {/* Add account */}
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    className="rounded-2xl border-2 border-dashed border-gray-300 p-4 w-[100px] shrink-0 flex flex-col items-center justify-center gap-2 bg-white active:bg-gray-50 transition-colors"
                  >
                    <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center">
                      <Plus size={16} className="text-[#6B7280]" />
                    </div>
                    <span className="text-[10px] text-[#6B7280] font-medium text-center leading-tight">Add Account</span>
                  </motion.button>
                </div>
              </div>
            </div>

            {/* ─────────────────────────────────────────────────────────
                SECTION 3 — MONTHLY SNAPSHOT (white bg)
            ───────────────────────────────────────────────────────── */}
            <div className="bg-white px-6 pt-6 pb-6">
              <SectionHeader title="This Month" badge="Feb 2026" />

              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Income', value: monthlyIncome, color: '#10B981', icon: <ArrowDownRight size={13} strokeWidth={2.5} /> },
                  { label: 'Spent', value: monthlySpent, color: '#EF4444', icon: <ArrowUpRight size={13} strokeWidth={2.5} /> },
                  { label: 'Saved', value: monthlySaved, color: '#3B82F6', icon: <TrendingUp size={13} strokeWidth={2.5} /> },
                ].map((stat, i) => (
                  <motion.div
                    key={stat.label}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 + i * 0.08, duration: 0.45 }}
                    className="rounded-2xl p-3.5 border border-[#E5E7EB] bg-gray-50"
                  >
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center mb-2.5"
                      style={{ background: stat.color + '18', color: stat.color }}
                    >
                      {stat.icon}
                    </div>
                    <p
                      className="text-[15px] font-bold text-[#1E293B] leading-tight"
                      style={{ fontVariantNumeric: 'tabular-nums' }}
                    >
                      {fmt(stat.value)}
                    </p>
                    <p className="text-[10px] text-[#6B7280] mt-0.5 font-medium">{stat.label}</p>
                  </motion.div>
                ))}
              </div>
            </div>

            {/* ─────────────────────────────────────────────────────────
                SECTION 4 — BUDGET HEALTH (gray-50 bg)
            ───────────────────────────────────────────────────────── */}
            <div className="bg-gray-50 px-6 pt-6 pb-6">
              <SectionHeader title="Budget Health" />

              <div className="bg-white rounded-2xl border border-[#E5E7EB] divide-y divide-gray-100 overflow-hidden">
                {budgets.map((b, i) => {
                  const pct = Math.min(b.spent / b.limit, 1)
                  const isOver = b.spent > b.limit
                  const barColor = isOver ? '#EF4444' : b.color
                  const remaining = b.limit - b.spent

                  return (
                    <motion.button
                      key={b.id}
                      whileTap={{ backgroundColor: '#F9FAFB' }}
                      className="w-full p-4 text-left transition-colors"
                      style={{ display: 'block' }}
                    >
                      <div className="flex items-center justify-between mb-2.5">
                        <div className="flex items-center gap-2.5">
                          <span className="text-[22px] leading-none">{b.emoji}</span>
                          <div>
                            <p className="text-sm font-medium text-[#1E293B] leading-tight">{b.category}</p>
                            <p
                              className="text-[10px] text-[#6B7280] mt-0.5"
                              style={{ fontVariantNumeric: 'tabular-nums' }}
                            >
                              {fmt(b.spent)} of {fmt(b.limit)}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p
                            className="text-sm font-semibold leading-tight"
                            style={{ fontVariantNumeric: 'tabular-nums', color: isOver ? '#EF4444' : '#1E293B' }}
                          >
                            {isOver ? `+${fmt(Math.abs(remaining))}` : fmt(remaining)}
                          </p>
                          {isOver ? (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#FEE2E2] text-[#EF4444] font-semibold">
                              Over
                            </span>
                          ) : (
                            <p className="text-[10px] text-[#6B7280]">left</p>
                          )}
                        </div>
                      </div>

                      {/* Animated progress bar */}
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${pct * 100}%` }}
                          transition={{ duration: 0.8, ease: 'easeOut', delay: 0.3 + i * 0.1 }}
                          className="h-full rounded-full"
                          style={{ backgroundColor: barColor }}
                        />
                      </div>
                    </motion.button>
                  )
                })}
              </div>
            </div>

            {/* ─────────────────────────────────────────────────────────
                SECTION 5 — RECENT TRANSACTIONS (white bg)
            ───────────────────────────────────────────────────────── */}
            <div className="bg-white px-6 pt-6 pb-6">
              <SectionHeader title="Recent Transactions" />

              <div className="rounded-2xl border border-[#E5E7EB] divide-y divide-gray-100 overflow-hidden">
                {transactions.map((txn, i) => (
                  <motion.button
                    key={txn.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 + i * 0.055, duration: 0.35 }}
                    whileTap={{ backgroundColor: '#F9FAFB' }}
                    className="w-full p-4 flex items-center gap-3 text-left transition-colors"
                  >
                    {/* Emoji avatar */}
                    <div className="w-11 h-11 rounded-full bg-gray-100 flex items-center justify-center text-xl shrink-0 leading-none">
                      {txn.emoji}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <p className="text-sm font-medium text-[#1E293B] truncate">{txn.name}</p>
                        {txn.recurring && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-[#6B7280] shrink-0">
                            Recurring
                          </span>
                        )}
                        {txn.pending && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#FEF3C7] text-[#D97706] shrink-0">
                            Pending
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[#6B7280]">{txn.category} · {txn.date}</p>
                    </div>

                    {/* Amount */}
                    <p
                      className="text-sm font-semibold shrink-0"
                      style={{
                        fontVariantNumeric: 'tabular-nums',
                        color: txn.amount > 0 ? '#10B981' : '#1E293B',
                      }}
                    >
                      {txn.amount > 0 ? '+' : '-'}{fmt(txn.amount)}
                    </p>
                  </motion.button>
                ))}
              </div>
            </div>

            {/* ─────────────────────────────────────────────────────────
                SECTION 6 — UPCOMING RECURRING (gray-50 bg)
            ───────────────────────────────────────────────────────── */}
            <div className="bg-gray-50 px-6 pt-6 pb-8">
              <SectionHeader title="Upcoming" />

              <div className="bg-white rounded-2xl border border-[#E5E7EB] divide-y divide-gray-100 overflow-hidden">
                {upcoming.map(item => (
                  <motion.button
                    key={item.id}
                    whileTap={{ backgroundColor: '#F9FAFB' }}
                    className="w-full p-4 flex items-center gap-3 text-left transition-colors"
                  >
                    <div className="w-11 h-11 rounded-full bg-gray-100 flex items-center justify-center text-xl shrink-0 leading-none">
                      {item.emoji}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#1E293B]">{item.name}</p>
                      <p className="text-xs text-[#6B7280]">{item.cadence}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p
                        className="text-sm font-semibold text-[#1E293B]"
                        style={{ fontVariantNumeric: 'tabular-nums' }}
                      >
                        {fmt(item.amount)}
                      </p>
                      <p className={`text-[10px] font-medium ${dueColor(item.daysUntil)}`}>
                        {item.daysUntil === 0 ? 'Due today' : `in ${item.daysUntil}d`}
                      </p>
                    </div>
                  </motion.button>
                ))}
              </div>
            </div>
          </motion.div>
        </div>

        {/* ── BOTTOM NAV ── */}
        <div className="bg-white border-t border-[#E5E7EB] px-4 pt-2 pb-1 flex items-center justify-around shrink-0">
          {(
            [
              { id: 'home', label: 'Home', Icon: Home },
              { id: 'transactions', label: 'Txns', Icon: Repeat },
              { id: 'budget', label: 'Budget', Icon: Wallet },
              { id: 'goals', label: 'Goals', Icon: Zap },
              { id: 'more', label: 'More', Icon: LayoutGrid },
            ] as const
          ).map(({ id, label, Icon }) => {
            const active = activeTab === id
            return (
              <motion.button
                key={id}
                whileTap={{ scale: 0.88 }}
                onClick={() => setActiveTab(id)}
                className="flex flex-col items-center gap-0.5 py-1 px-3 relative"
              >
                <Icon
                  size={22}
                  strokeWidth={active ? 2.2 : 1.8}
                  style={{ color: active ? '#1E293B' : '#9CA3AF' }}
                />
                <span
                  className="text-[10px] font-medium leading-tight"
                  style={{ color: active ? '#1E293B' : '#9CA3AF' }}
                >
                  {label}
                </span>
                {active && (
                  <motion.div
                    layoutId="navIndicator"
                    className="absolute -top-2 left-1/2 -translate-x-1/2 w-5 h-[3px] bg-[#1E293B] rounded-full"
                    transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  />
                )}
              </motion.button>
            )
          })}
        </div>

        {/* Home indicator bar */}
        <div className="bg-white pb-2 flex justify-center shrink-0">
          <div className="w-32 h-1 bg-[#1E293B] rounded-full opacity-[0.15]" />
        </div>
      </div>
    </div>
  )
}
