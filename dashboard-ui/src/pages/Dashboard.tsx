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
        <div className="text-gray-500 text-sm">加载失败: {state.message}</div>
      </div>
    )
  }

  const { user, stats } = state

  return (
    <div className="min-h-screen bg-[#f0f2f5]">
      <Navbar onLogout={api.logout} />
      <main className="max-w-4xl mx-auto px-4 py-8 space-y-5">
        <ProfileCard user={user} onUpgrade={() => setShowUpgrade(true)} />
        <StatsRow total={stats.total} recentCount={stats.history.length} membership={user.membership} />
        <HistorySection items={stats.history} />
      </main>
      {showUpgrade && (
        <UpgradeModal
          onClose={() => setShowUpgrade(false)}
          onSuccess={() => { setShowUpgrade(false); refreshUser() }}
        />
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
            <TranslateIcon />
          </div>
          <span className="text-[15px] font-semibold text-gray-900">智能翻译</span>
        </a>
        <div className="flex items-center gap-4">
          <button
            onClick={onLogout}
            className="text-sm text-gray-500 border border-gray-200 px-3.5 py-1.5 rounded-lg hover:text-red-500 hover:border-red-300 transition-colors cursor-pointer bg-transparent"
          >
            退出登录
          </button>
        </div>
      </div>
    </nav>
  )
}

/* ── Profile ─────────────────────────────────────────────────────── */
function ProfileCard({ user, onUpgrade }: { user: User; onUpgrade: () => void }) {
  const initial = (user.nickname || '用')[0]
  return (
    <div className="bg-white rounded-2xl shadow-sm p-7 flex items-center gap-6">
      <div className="w-[72px] h-[72px] rounded-full overflow-hidden flex-shrink-0 bg-gradient-to-br from-indigo-400 to-indigo-600 flex items-center justify-center text-white text-3xl font-bold">
        {user.avatar_url ? (
          <img src={user.avatar_url} alt="头像" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
        ) : initial}
      </div>
      <div className="flex-1">
        <div className="text-xl font-bold text-gray-900 mb-1.5">{user.nickname || '用户'}</div>
        <div className="flex items-center gap-3">
          {user.membership === 'pro' ? (
            <span className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
              ⭐ Pro 会员
            </span>
          ) : (
            <>
              <span className="inline-flex items-center text-xs font-medium px-3 py-1 rounded-full bg-gray-100 text-gray-500">
                免费版
              </span>
              <button
                onClick={onUpgrade}
                className="text-xs font-semibold px-3 py-1 rounded-full bg-indigo-500 text-white hover:bg-indigo-600 transition-colors cursor-pointer border-none"
              >
                升级 Pro ¥9.9/月
              </button>
            </>
          )}
          {user.membership === 'pro' && user.membership_expires_at && (
            <span className="text-xs text-gray-400">
              到期：{user.membership_expires_at.slice(0, 10)}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── Stats ───────────────────────────────────────────────────────── */
function StatsRow({ total, recentCount, membership }: { total: number; recentCount: number; membership: string }) {
  return (
    <div className="grid grid-cols-3 gap-4">
      <StatCard value={total} label="累计翻译次数" />
      <StatCard value={recentCount} label="最近记录条数" />
      <StatCard value={membership === 'pro' ? '⭐ Pro' : '免费'} label="会员状态" small={membership === 'pro'} />
    </div>
  )
}

function StatCard({ value, label, small }: { value: string | number; label: string; small?: boolean }) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-5 text-center">
      <div className={`font-bold text-indigo-600 mb-1 ${small ? 'text-xl pt-1.5' : 'text-3xl'}`}>{value}</div>
      <div className="text-[13px] text-gray-400">{label}</div>
    </div>
  )
}

/* ── History ─────────────────────────────────────────────────────── */
function HistorySection({ items }: { items: HistoryItem[] }) {
  return (
    <div>
      <h2 className="text-[15px] font-semibold text-gray-800 mb-3">最近翻译记录</h2>
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        {items.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-400">暂无记录，使用插件或网页翻译后会显示在这里</div>
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
    </div>
  )
}

function HistoryRow({ item, last }: { item: HistoryItem; last: boolean }) {
  return (
    <tr className={`hover:bg-gray-50 transition-colors ${last ? '' : 'border-b border-gray-50'}`}>
      <td className="px-5 py-3.5 text-gray-800 max-w-0"><div className="truncate">{item.source_text}</div></td>
      <td className="px-5 py-3.5 text-indigo-600 max-w-0"><div className="truncate">{item.translated_text}</div></td>
      <td className="px-5 py-3.5 text-gray-400 whitespace-nowrap">{lang(item.source_lang)} → {lang(item.target_lang)}</td>
      <td className="px-5 py-3.5 text-gray-300 text-right whitespace-nowrap text-xs">{item.created_at}</td>
    </tr>
  )
}

/* ── Icon ────────────────────────────────────────────────────────── */
function TranslateIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 8l6 6"/><path d="M4 14l6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/>
      <path d="m22 22-5-10-5 10"/><path d="M14 18h6"/>
    </svg>
  )
}
