export interface User {
  id: number
  nickname: string
  avatar_url: string
  email: string
  membership: 'free' | 'pro'
  membership_expires_at: string | null
}

export interface HistoryItem {
  source_text: string
  translated_text: string
  source_lang: string
  target_lang: string
  created_at: string
}

export interface UserStats {
  total: number
  history: HistoryItem[]
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'include', ...options })
  if (res.status === 401) {
    throw new Error('Unauthorized')
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export const api = {
  me: () => request<User>('/api/user/me'),
  stats: () => request<UserStats>('/api/user/stats'),
  logout: () =>
    fetch('/auth/logout', { method: 'POST', credentials: 'include' }).then(() => {
      window.location.href = '/login'
    }),
}
