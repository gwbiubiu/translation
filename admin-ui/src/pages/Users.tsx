import { useEffect, useState, useCallback, useRef } from 'react'
import { api, type AdminUser, type UsersResult } from '../lib/api'

const PAGE_SIZE = 20

export default function Users() {
  const [result, setResult] = useState<UsersResult | null>(null)
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const [inputQ, setInputQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [updating, setUpdating] = useState<number | null>(null)
  const [confirm, setConfirm] = useState<AdminUser | null>(null)
  const [months, setMonths] = useState(1)

  const fetchUsers = useCallback((p: number, query: string) => {
    setLoading(true)
    api.users(p, query)
      .then(setResult)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetchUsers(page, q) }, [page, q, fetchUsers])

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    setPage(1)
    setQ(inputQ)
  }

  async function confirmToggle() {
    if (!confirm) return
    const user = confirm
    const next = user.membership === 'pro' ? 'free' : 'pro'
    const m = months
    setConfirm(null)
    setMonths(1)
    setUpdating(user.id)
    try {
      await api.updateMembership(user.id, next, m)
      // 重新拉取当页数据以获得最新 expires_at
      fetchUsers(page, q)
    } catch (e: any) {
      alert(e.message)
    } finally {
      setUpdating(null)
    }
  }

  const totalPages = result ? Math.ceil(result.total / PAGE_SIZE) : 0

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-white">用户管理</h2>
        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            value={inputQ}
            onChange={e => setInputQ(e.target.value)}
            placeholder="搜索昵称 / OpenID…"
            className="bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-indigo-500 w-56"
          />
          <button
            type="submit"
            className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm px-4 py-2 rounded-lg transition-colors cursor-pointer"
          >
            搜索
          </button>
        </form>
      </div>

      {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-xs text-slate-500 font-medium">
              <th className="text-left px-5 py-3.5">用户</th>
              <th className="text-left px-5 py-3.5">OpenID</th>
              <th className="text-center px-5 py-3.5">翻译次数</th>
              <th className="text-center px-5 py-3.5">注册时间</th>
              <th className="text-center px-5 py-3.5">会员</th>
              <th className="text-center px-5 py-3.5">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="py-16 text-center">
                  <div className="w-6 h-6 border-2 border-slate-700 border-t-indigo-500 rounded-full animate-spin mx-auto" />
                </td>
              </tr>
            ) : result?.users.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-16 text-center text-slate-500 text-sm">暂无用户</td>
              </tr>
            ) : (
              result?.users.map((user, i) => (
                <tr
                  key={user.id}
                  className={`border-b border-slate-800/60 hover:bg-slate-800/40 transition-colors ${
                    i === (result.users.length - 1) ? 'border-b-0' : ''
                  }`}
                >
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-indigo-600/20 flex items-center justify-center text-xs text-indigo-400 font-bold flex-shrink-0 overflow-hidden">
                        {user.avatar_url
                          ? <img src={user.avatar_url} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          : (user.nickname || '?')[0]}
                      </div>
                      <span className="text-slate-200 font-medium">{user.nickname || '—'}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-slate-500 font-mono text-xs max-w-[160px]">
                    <div className="truncate">{user.openid}</div>
                  </td>
                  <td className="px-5 py-3.5 text-center text-slate-300">{user.translation_count}</td>
                  <td className="px-5 py-3.5 text-center text-slate-500 text-xs">{user.created_at}</td>
                  <td className="px-5 py-3.5 text-center">
                    {user.membership === 'pro' ? (
                      <div className="flex flex-col items-center gap-1">
                        <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-950/60 text-amber-400 border border-amber-900/50">
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                          </svg>
                          Pro
                        </span>
                        {user.membership_expires_at && (
                          <span className="text-[11px] text-slate-500">
                            到期 {user.membership_expires_at}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="inline-flex items-center text-xs px-2.5 py-1 rounded-full bg-slate-800 text-slate-500 border border-slate-700">
                        免费
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-center">
                    <button
                      onClick={() => setConfirm(user)}
                      disabled={updating === user.id}
                      className={`text-xs px-3 py-1.5 rounded-lg transition-colors cursor-pointer disabled:opacity-40 ${
                        user.membership === 'pro'
                          ? 'bg-slate-800 text-slate-400 hover:bg-red-950/50 hover:text-red-400 border border-slate-700 hover:border-red-900'
                          : 'bg-indigo-950/50 text-indigo-400 hover:bg-indigo-600 hover:text-white border border-indigo-900'
                      }`}
                    >
                      {updating === user.id ? '…' : user.membership === 'pro' ? '取消 Pro' : '升级 Pro'}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 分页 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <span className="text-sm text-slate-500">
            共 {result?.total} 条，第 {page} / {totalPages} 页
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 rounded-lg text-sm bg-slate-800 text-slate-400 disabled:opacity-40 hover:bg-slate-700 transition-colors cursor-pointer"
            >
              上一页
            </button>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1.5 rounded-lg text-sm bg-slate-800 text-slate-400 disabled:opacity-40 hover:bg-slate-700 transition-colors cursor-pointer"
            >
              下一页
            </button>
          </div>
        </div>
      )}

      {confirm && (
        <ConfirmModal
          user={confirm}
          months={months}
          setMonths={setMonths}
          onConfirm={confirmToggle}
          onCancel={() => { setConfirm(null); setMonths(1) }}
        />
      )}
    </div>
  )
}

function ConfirmModal({ user, months, setMonths, onConfirm, onCancel }: {
  user: AdminUser
  months: number
  setMonths: (n: number) => void
  onConfirm: () => void
  onCancel: () => void
}) {
  const isRevoke = user.membership === 'pro'
  const confirmRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    confirmRef.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4"
      onClick={onCancel}
    >
      <div
        className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-sm p-6"
        onClick={e => e.stopPropagation()}
      >
        {/* 图标 */}
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center mb-4 ${
          isRevoke ? 'bg-red-950/60' : 'bg-indigo-950/60'
        }`}>
          {isRevoke ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
            </svg>
          )}
        </div>

        <h3 className="text-base font-semibold text-white mb-1">
          {isRevoke ? '取消 Pro 会员' : '升级为 Pro 会员'}
        </h3>
        <p className="text-sm text-slate-400 mb-5 leading-relaxed">
          用户：<span className="font-medium text-slate-200">{user.nickname || `#${user.id}`}</span>
          {!isRevoke && user.membership_expires_at && (
            <span className="text-slate-500">（当前到期 {user.membership_expires_at}）</span>
          )}
        </p>

        {/* 月数选择器（仅升级时显示） */}
        {!isRevoke && (
          <div className="mb-5">
            <p className="text-xs text-slate-400 mb-3">开通时长</p>
            <div className="grid grid-cols-6 gap-1.5">
              {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMonths(m)}
                  className={`py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer border ${
                    months === m
                      ? 'bg-indigo-600 text-white border-indigo-500'
                      : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700 hover:text-white'
                  }`}
                >
                  {m}月
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors cursor-pointer border border-slate-700"
          >
            取消
          </button>
          <button
            ref={confirmRef}
            onClick={onConfirm}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors cursor-pointer border-none ${
              isRevoke
                ? 'bg-red-600 hover:bg-red-500 text-white'
                : 'bg-indigo-600 hover:bg-indigo-500 text-white'
            }`}
          >
            {isRevoke ? '确认取消' : `确认升级 ${months} 个月`}
          </button>
        </div>
      </div>
    </div>
  )
}
