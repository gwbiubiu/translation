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
      {/* 统计卡片 */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
        <StatCard label="总用户数" value={overview!.total_users} color="indigo" icon="👥" />
        <StatCard label="总翻译次数" value={overview!.total_translations} color="violet" icon="🌐" />
        <StatCard label="今日新增用户" value={overview!.new_users_today} color="emerald" icon="✨" />
        <StatCard label="今日翻译次数" value={overview!.translations_today} color="amber" icon="📊" />
      </div>

      {/* 图表 */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <ChartCard title="翻译次数趋势（近14天）">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData} margin={{ top: 5, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 11 }} />
              <YAxis tick={{ fill: '#64748b', fontSize: 11 }} />
              <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, color: '#e2e8f0' }} />
              <Line type="monotone" dataKey="翻译次数" stroke="#6366f1" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="新增用户趋势（近14天）">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData} margin={{ top: 5, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 11 }} />
              <YAxis tick={{ fill: '#64748b', fontSize: 11 }} />
              <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, color: '#e2e8f0' }} />
              <Line type="monotone" dataKey="新增用户" stroke="#10b981" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </PageShell>
  )
}

function StatCard({ label, value, color, icon }: { label: string; value: number; color: string; icon: string }) {
  const colors: Record<string, string> = {
    indigo: 'text-indigo-400 bg-indigo-950/50 border-indigo-900/50',
    violet: 'text-violet-400 bg-violet-950/50 border-violet-900/50',
    emerald: 'text-emerald-400 bg-emerald-950/50 border-emerald-900/50',
    amber: 'text-amber-400 bg-amber-950/50 border-amber-900/50',
  }
  return (
    <div className={`rounded-xl border p-5 ${colors[color]}`}>
      <div className="text-2xl mb-2">{icon}</div>
      <div className="text-3xl font-bold text-white mb-1">{value.toLocaleString()}</div>
      <div className="text-sm opacity-70">{label}</div>
    </div>
  )
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <h3 className="text-sm font-medium text-slate-300 mb-4">{title}</h3>
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
