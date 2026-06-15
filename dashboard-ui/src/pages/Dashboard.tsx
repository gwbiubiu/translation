import { useEffect, useState } from 'react'
import type { User, UserStats, HistoryItem } from '../lib/api'
import { api } from '../lib/api'
import UpgradeModal from '../components/UpgradeModal'

const LANG: Record<string, string> = { zh: '中文', en: '英语' }
const lang = (code: string) => LANG[code] || code

type State =
  | { phase: 'loading' }
  | { phase: 'ready'; user: User; stats: UserStats }
  | { phase: 'error'; message: string }

export default function Dashboard() {
  const [state, setState] = useState<State>({ phase: 'loading' })
  const [showUpgrade, setShowUpgrade] = useState(false)

  useEffect(() => {
    Promise.all([api.me(), api.stats()])
      .then(([user, stats]) => setState({ phase: 'ready', user, stats }))
      .catch((e) => {
        if (e.message !== 'Unauthorized') {
          setState({ phase: 'error', message: e.message })
        }
      })
  }, [])

  const refreshUser = () => {
    api.me()
      .then((user) => setState((s) => (s.phase === 'ready' ? { ...s, user } : s)))
      .catch(() => {})
  }

  if (state.phase === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f0f2f5]">
        <div className="w-8 h-8 border-2 border-gray-200 border-t-indigo-500 rounded-full animate-spin" />
      </div>
    )
  }

  if (state.phase === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f0f2f5]">
        <p className="text-sm text-gray-500">加载失败: {state.message}</p>
      </div>
    )
  }

  const { user, stats } = state

  return (
    <div className="min-h-screen bg-[#f0f2f5]">
      <Navbar onLogout={api.logout} />
      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex flex-col gap-5">
          <ProfileCard user={user} onUpgrade={() => setShowUpgrade(true)} />
          <StatsRow total={stats.total} recentCount={stats.history.length} membership={user.membership} />
          <HistorySection items={stats.history} />
        </div>
      </main>
      {showUpgrade && (
        <UpgradeModal email={user.email} onClose={() => setShowUpgrade(false)} />
      )}
    </div>
  )
}

/* ── Navbar ─────────────────────────────────────────────────────── */
function Navbar({ onLogout }: { onLogout: () => void }) {
  return (
    <nav className="bg-white border-b border-gray-100 sticky top-0 z-10">
      <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
        <a href="/" className="flex items-center gap-2.5 no-underline">
          <div className="w-8 h-8 rounded-[9px] bg-gradient-to-br from-indigo-400 to-indigo-600 flex items-center justify-center shadow-sm shadow-indigo-200">
            <TranslateIcon size={16} stroke="white" />
          </div>
          <span className="text-[15px] font-semibold text-gray-900">智能翻译</span>
        </a>
        <button
          onClick={onLogout}
          className="text-sm text-gray-500 border border-gray-200 px-3.5 py-1.5 rounded-lg hover:text-red-500 hover:border-red-300 transition-colors cursor-pointer bg-transparent"
        >
          退出登录
        </button>
      </div>
    </nav>
  )
}

/* ── Profile Card ────────────────────────────────────────────────── */
function ProfileCard({ user, onUpgrade }: { user: User; onUpgrade: () => void }) {
  const initial = (user.nickname || '用')[0]
  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      {/* Gradient banner */}
      <div
        className="h-20"
        style={{ background: 'linear-gradient(135deg, #818cf8 0%, #4f46e5 100%)' }}
        aria-hidden="true"
      />
      {/* Content — avatar overlaps the banner */}
      <div className="px-7 pb-7" style={{ marginTop: '-28px' }}>
        {/* Avatar */}
        <div
          className="bg-gradient-to-br from-indigo-400 to-indigo-600 flex-shrink-0 flex items-center justify-center text-white font-bold overflow-hidden"
          style={{
            width: 72,
            height: 72,
            borderRadius: '50%',
            border: '3px solid white',
            fontSize: 26,
            marginBottom: 14,
          }}
          aria-label={user.nickname ? `${user.nickname}的头像` : '用户头像'}
        >
          {user.avatar_url ? (
            <img
              src={user.avatar_url}
              alt=""
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
          ) : initial}
        </div>

        {/* Name */}
        <h1 className="text-xl font-bold text-gray-900 mb-2.5">{user.nickname || '用户'}</h1>

        {/* Membership row */}
        <div className="flex items-center gap-2.5">
          {user.membership === 'pro' ? (
            <>
              <span className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                <StarIcon />
                Pro 会员
              </span>
              {user.membership_expires_at && (
                <span className="text-xs text-gray-400">
                  到期：{user.membership_expires_at.slice(0, 10)}
                </span>
              )}
            </>
          ) : (
            <>
              <span className="inline-flex items-center text-xs font-medium px-3 py-1 rounded-full bg-gray-100 text-gray-500">
                免费版
              </span>
              <button
                onClick={onUpgrade}
                className="text-xs font-semibold px-3 py-1 rounded-full bg-indigo-500 text-white hover:bg-indigo-600 transition-colors cursor-pointer border-none"
              >
                升级 Pro ¥10/月
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── Stats Row ───────────────────────────────────────────────────── */
function StatsRow({ total, recentCount, membership }: { total: number; recentCount: number; membership: string }) {
  const isPro = membership === 'pro'
  return (
    <div className="grid grid-cols-3 gap-4">
      <StatCard
        icon={<TranslateIcon size={20} stroke="#a5b4fc" />}
        value={total}
        label="累计翻译"
        unit="次"
      />
      <StatCard
        icon={<ClockIcon />}
        value={recentCount}
        label="最近记录"
        unit="条"
      />
      <StatCard
        icon={isPro ? <StarIcon size={20} color="#d97706" /> : <GiftIcon />}
        value={isPro ? 'Pro' : '免费'}
        label="会员状态"
        valuePro={isPro}
      />
    </div>
  )
}

function StatCard({
  icon,
  value,
  label,
  unit,
  valuePro,
}: {
  icon: React.ReactNode
  value: string | number
  label: string
  unit?: string
  valuePro?: boolean
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-5">
      <div className="mb-3">{icon}</div>
      <div className="flex items-baseline gap-1 mb-1">
        <span
          className={`font-bold leading-none ${valuePro ? 'text-amber-600' : 'text-indigo-600'}`}
          style={{ fontSize: typeof value === 'number' ? 28 : 20 }}
        >
          {value}
        </span>
        {unit && <span className="text-sm text-gray-400">{unit}</span>}
      </div>
      <p className="text-[13px] text-gray-400">{label}</p>
    </div>
  )
}

/* ── History Section ─────────────────────────────────────────────── */
function HistorySection({ items }: { items: HistoryItem[] }) {
  return (
    <section>
      <h2 className="text-[15px] font-semibold text-gray-800 mb-3">最近翻译记录</h2>
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        {items.length === 0 ? (
          <div className="py-14 flex flex-col items-center gap-3 text-center">
            <EmptyDocIcon />
            <p className="text-sm text-gray-400">暂无记录，使用插件或网页翻译后会显示在这里</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs text-gray-400 font-medium border-b border-gray-100">
                <th className="text-left px-5 py-3 w-[38%]">原文</th>
                <th className="text-left px-5 py-3 w-[38%]">译文</th>
                <th className="text-left px-5 py-3 w-[14%]">语言</th>
                <th className="text-right px-5 py-3 w-[10%]">时间</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <HistoryRow key={i} item={item} last={i === items.length - 1} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  )
}

function HistoryRow({ item, last }: { item: HistoryItem; last: boolean }) {
  return (
    <tr className={`hover:bg-gray-50 transition-colors ${last ? '' : 'border-b border-gray-50'}`}>
      <td className="px-5 py-3.5 text-gray-800 max-w-0">
        <div className="truncate">{item.source_text}</div>
      </td>
      <td className="px-5 py-3.5 text-indigo-600 max-w-0">
        <div className="truncate">{item.translated_text}</div>
      </td>
      <td className="px-5 py-3.5 text-gray-400 whitespace-nowrap">
        {lang(item.source_lang)} → {lang(item.target_lang)}
      </td>
      <td className="px-5 py-3.5 text-gray-300 text-right whitespace-nowrap text-xs">
        {item.created_at}
      </td>
    </tr>
  )
}

/* ── Icons ───────────────────────────────────────────────────────── */
function TranslateIcon({ size = 16, stroke = 'currentColor' }: { size?: number; stroke?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 8l6 6"/><path d="M4 14l6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/>
      <path d="m22 22-5-10-5 10"/><path d="M14 18h6"/>
    </svg>
  )
}

function StarIcon({ size = 11, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden="true">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
    </svg>
  )
}

function ClockIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#a5b4fc" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10"/>
      <path d="M12 6v6l4 2"/>
    </svg>
  )
}

function GiftIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#a5b4fc" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 12v10H4V12"/><path d="M22 7H2v5h20V7z"/>
      <path d="M12 22V7"/>
      <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/>
      <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>
    </svg>
  )
}

function EmptyDocIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/>
    </svg>
  )
}
