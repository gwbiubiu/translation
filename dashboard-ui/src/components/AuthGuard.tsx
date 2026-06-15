import { type ReactNode, useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { api } from '../lib/api'

type AuthState = 'loading' | 'ok' | 'unauth'

export default function AuthGuard({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>('loading')

  useEffect(() => {
    api.me()
      .then(() => setState('ok'))
      .catch(() => setState('unauth'))
  }, [])

  if (state === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f0f2f5]">
        <div className="w-8 h-8 border-2 border-gray-200 border-t-indigo-500 rounded-full animate-spin" />
      </div>
    )
  }

  if (state === 'unauth') {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}
