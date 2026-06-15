import { useEffect, useState } from 'react'
import { api, type User, type UserStats } from './lib/api'
import Dashboard from './pages/Dashboard'

type State =
  | { phase: 'loading' }
  | { phase: 'ready'; user: User; stats: UserStats }
  | { phase: 'error'; message: string }

export default function App() {
  const [state, setState] = useState<State>({ phase: 'loading' })

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
    api.me().then((user) =>
      setState((s) => (s.phase === 'ready' ? { ...s, user } : s))
    ).catch(() => {})
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

  return (
    <Dashboard
      user={state.user}
      stats={state.stats}
      onLogout={api.logout}
      onRefreshUser={refreshUser}
    />
  )
}
