import { useEffect, useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { api, type Overview, type DailyStat } from '../lib/api'

export default function Overview() {
  const [overview, setOverview] = useState<Overview | null>(null)
  const [daily, setDaily] = useState<DailyStat[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api.stats()
      .then(d => { setOverview(d.overview); setDaily(d.daily) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <PageShell><Spinner /></PageShell>
  if (error) return <PageShell><p className="text-red-400 text-sm">{error}</p></PageShell>

  const chartData = daily.map(d => ({
    date: d.date.slice(5),
    '新增用户': d.new_users,
    '翻译次数': d.translations,
  }))

  return (
    <PageShell>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="总用户数"
          value={overview!.total_users}
          icon={<UsersIcon />}
          accent="indigo"
        />
        <StatCard
          label="总翻译次数"
          value={overview!.total_translations}
          icon={<TranslateIcon />}
          accent="violet"
        />
        <StatCard
          label="今日新增用户"
          value={overview!.new_users_today}
          icon={<UserPlusIcon />}
          accent="emerald"
        />
        <StatCard
          label="今日翻译次数"
          value={overview!.translations_today}
          icon={<ChartBarIcon />}
          accent="amber"
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <ChartCard title="翻译次数趋势（近 14 天）">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData} margin={{ top: 5, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 11 }} />
              <YAxis tick={{ fill: '#64748b', fontSize: 11 }} />
              <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, color: '#e2e8f0', fontSize: 12 }} />
              <Line type="monotone" dataKey="翻译次数" stroke="#6366f1" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="新增用户趋势（近 14 天）">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData} margin={{ top: 5, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 11 }} />
              <YAxis tick={{ fill: '#64748b', fontSize: 11 }} />
              <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, color: '#e2e8f0', fontSize: 12 }} />
              <Line type="monotone" dataKey="新增用户" stroke="#10b981" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </PageShell>
  )
}

const ACCENT: Record<string, { card: string; icon: string }> = {
  indigo:  { card: 'border-indigo-900/40',  icon: 'bg-indigo-900/50 text-indigo-400' },
  violet:  { card: 'border-violet-900/40',  icon: 'bg-violet-900/50 text-violet-400' },
  emerald: { card: 'border-emerald-900/40', icon: 'bg-emerald-900/50 text-emerald-400' },
  amber:   { card: 'border-amber-900/40',   icon: 'bg-amber-900/50 text-amber-400' },
}

function StatCard({ label, value, icon, accent }: {
  label: string; value: number; icon: React.ReactNode; accent: string
}) {
  const c = ACCENT[accent]
  return (
    <div className={`bg-slate-900 rounded-xl border p-5 ${c.card}`}>
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-4 ${c.icon}`}>
        {icon}
      </div>
      <div className="text-3xl font-bold text-white mb-1.5 tabular-nums">{value.toLocaleString()}</div>
      <div className="text-sm text-slate-500">{label}</div>
    </div>
  )
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <h3 className="text-sm font-medium text-slate-300 mb-5">{title}</h3>
      {children}
    </div>
  )
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="p-8">
      <h2 className="text-lg font-semibold text-white mb-6">数据概览</h2>
      {children}
    </div>
  )
}

function Spinner() {
  return (
    <div className="flex justify-center py-20">
      <div className="w-7 h-7 border-2 border-slate-700 border-t-indigo-500 rounded-full animate-spin" />
    </div>
  )
}

function UsersIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  )
}

function TranslateIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 8l6 6"/><path d="M4 14l6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/>
      <path d="m22 22-5-10-5 10"/><path d="M14 18h6"/>
    </svg>
  )
}

function UserPlusIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="8.5" cy="7" r="4"/>
      <line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/>
    </svg>
  )
}

function ChartBarIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/>
      <line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/>
    </svg>
  )
}
