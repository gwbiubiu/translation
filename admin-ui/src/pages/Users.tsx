import { useEffect, useState, useCallback } from 'react'
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

  async function toggleMembership(user: AdminUser) {
    const next = user.membership === 'pro' ? 'free' : 'pro'
    setUpdating(user.id)
    try {
      await api.updateMembership(user.id, next)
      setResult(prev => prev ? {
        ...prev,
        users: prev.users.map(u => u.id === user.id ? { ...u, membership: next } : u),
      } : prev)
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
                      <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-amber-950/60 text-amber-400 border border-amber-900/50">
                        ⭐ Pro
                      </span>
                    ) : (
                      <span className="inline-flex items-center text-xs px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-500 border border-slate-700">
                        免费
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-center">
                    <button
                      onClick={() => toggleMembership(user)}
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
    </div>
  )
}
