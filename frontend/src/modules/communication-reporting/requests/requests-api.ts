import '../../../api/client'

export type RequestStatus =
  | 'created'
  | 'viewed'
  | 'returned'
  | 'edited'
  | 'resolved'
  | 'approved'
  | 'canceled'

export type RequestBox = 'inbox' | 'sent' | 'unclaimed'

export interface UserSummary {
  id: number
  username: string
  full_name: string
}

export interface StatusHistoryEntry {
  id: number
  actor: UserSummary | null
  from_status: RequestStatus | null
  to_status: RequestStatus
  note: string | null
  forwarded_to: UserSummary | null
  created_at: string
}

export interface RequestSummary {
  id: string
  purpose: string
  status: RequestStatus
  created_by: UserSummary | null
  current_recipient: UserSummary | null
  recipient_pool: string | null
  created_at: string
  updated_at: string
  viewed_at: string | null
  resolved_at: string | null
}

export interface RequestDetail extends RequestSummary {
  description: string
  return_reason: string | null
  history: StatusHistoryEntry[]
}

export interface RequestConfig {
  overdue_after_days: number
  updated_at: string | null
}

export interface OverdueNotification {
  id: number
  request_id: string
  request_purpose: string
  request_status: RequestStatus
  created_at: string
  read_at: string | null
}

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem('access_token')
  const res = await fetch(`/api/v1${url}`, {
    ...options,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options?.headers || {}),
    },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: res.statusText } }))
    throw new Error(err.error?.message || res.statusText)
  }
  if (res.status === 204 || res.headers.get('content-length') === '0') {
    return undefined as T
  }
  return (await res.json()) as T
}

const json = (body: unknown) => ({
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

export const listRequests = (params: {
  box?: RequestBox
  status?: RequestStatus
  q?: string
}): Promise<{ items: RequestSummary[] }> => {
  const qs = new URLSearchParams()
  if (params.box) qs.set('box', params.box)
  if (params.status) qs.set('status', params.status)
  if (params.q) qs.set('q', params.q)
  const suffix = qs.toString() ? `?${qs.toString()}` : ''
  return apiFetch(`/requests${suffix}`)
}

export const getRequest = (id: string): Promise<RequestDetail> =>
  apiFetch(`/requests/${id}`)

export const createRequest = (body: {
  purpose: string
  description: string
  recipient_id?: number | null
}): Promise<RequestDetail> =>
  apiFetch('/requests', { method: 'POST', ...json(body) })

export const editRequest = (
  id: string,
  body: { purpose: string; description: string },
): Promise<RequestDetail> =>
  apiFetch(`/requests/${id}`, { method: 'PATCH', ...json(body) })

export const claimRequest = (id: string): Promise<RequestDetail> =>
  apiFetch(`/requests/${id}/claim`, { method: 'POST' })

export const cancelRequest = (id: string, note?: string): Promise<RequestDetail> =>
  apiFetch(`/requests/${id}/cancel`, { method: 'POST', ...json({ note: note ?? null }) })

export const returnRequest = (id: string, note: string): Promise<RequestDetail> =>
  apiFetch(`/requests/${id}/return`, { method: 'POST', ...json({ note }) })

export const resolveRequest = (id: string, note?: string): Promise<RequestDetail> =>
  apiFetch(`/requests/${id}/resolve`, { method: 'POST', ...json({ note: note ?? null }) })

export const approveRequest = (id: string, note?: string): Promise<RequestDetail> =>
  apiFetch(`/requests/${id}/approve`, { method: 'POST', ...json({ note: note ?? null }) })

export const forwardRequest = (
  id: string,
  recipientId: number,
  note?: string,
): Promise<RequestDetail> =>
  apiFetch(`/requests/${id}/forward`, {
    method: 'POST',
    ...json({ recipient_id: recipientId, note: note ?? null }),
  })

export const getRequestConfig = (): Promise<RequestConfig> => apiFetch('/requests/config')

export const updateRequestConfig = (overdueAfterDays: number): Promise<RequestConfig> =>
  apiFetch('/requests/config', {
    method: 'PUT',
    ...json({ overdue_after_days: overdueAfterDays }),
  })

export const listOverdueNotifications = (): Promise<{ items: OverdueNotification[] }> =>
  apiFetch('/requests/notifications')

export const markNotificationRead = (id: number): Promise<OverdueNotification> =>
  apiFetch(`/requests/notifications/${id}/read`, { method: 'POST' })

export interface ChatUser {
  id: number
  username: string
  full_name: string
}
export const searchUsers = (q: string, role?: string, limit = 20): Promise<{ items: ChatUser[] }> => {
  const qs = new URLSearchParams({ q, limit: String(limit) })
  if (role) qs.set('role', role)
  return apiFetch(`/chat/users/search?${qs.toString()}`)
}
