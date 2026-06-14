import { useEffect, useState } from 'react'
import { api } from './lib/api'
import Login from './pages/Login'
import Overview from './pages/Overview'
import Users from './pages/Users'
import Layout from './components/Layout'

type AuthState =
  | { phase: 'loading' }
  | { phase: 'unauthenticated' }
  | { phase: 'authenticated'; username: string }

export default function App() {
  const [auth, setAuth] = useState<AuthState>({ phase: 'loading' })

  function checkAuth() {
    api.me()
      .then(u => setAuth({ phase: 'authenticated', username: u.username }))
      .catch(e => {
        if (e.status === 401) setAuth({ phase: 'unauthenticated' })
        else setAuth({ phase: 'unauthenticated' })
      })
  }

  useEffect(checkAuth, [])

  if (auth.phase === 'loading') {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-slate-700 border-t-indigo-500 rounded-full animate-spin" />
      </div>
    )
  }

  if (auth.phase === 'unauthenticated') {
    return <Login onLogin={checkAuth} />
  }

  return (
    <Layout
      username={auth.username}
      onLogout={() => setAuth({ phase: 'unauthenticated' })}
    >
      {page => page === 'overview' ? <Overview /> : <Users />}
    </Layout>
  )
}
