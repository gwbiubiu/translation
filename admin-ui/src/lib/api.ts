export interface Overview {
  total_users: number
  total_translations: number
  new_users_today: number
  translations_today: number
}

export interface DailyStat {
  date: string
  new_users: number
  translations: number
}

export interface AdminUser {
  id: number
  openid: string
  nickname: string
  avatar_url: string
  membership: 'free' | 'pro'
  membership_expires_at: string | null
  created_at: string
  translation_count: number
}

export interface UsersResult {
  total: number
  page: number
  page_size: number
  users: AdminUser[]
}

async function req<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'include', ...opts })
  if (res.status === 401) throw Object.assign(new Error('Unauthorized'), { status: 401 })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  return res.json()
}

export const api = {
  login: (username: string, password: string) =>
    req<{ ok: boolean }>('/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    }),

  logout: () => req('/admin/logout', { method: 'POST' }),

  me: () => req<{ username: string; is_admin: boolean }>('/admin/me'),

  stats: () =>
    req<{ overview: Overview; daily: DailyStat[] }>('/admin/api/stats'),

  users: (page = 1, q = '') =>
    req<UsersResult>(`/admin/api/users?page=${page}&q=${encodeURIComponent(q)}`),

  updateMembership: (id: number, membership: string, months = 1) =>
    req<{ ok: boolean }>(`/admin/api/users/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ membership, months }),
    }),
}
