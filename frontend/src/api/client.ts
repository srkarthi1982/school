import { client } from './generated/client.gen'
import { useServerErrorStore } from '../infra/shared/store/useServerErrorStore'
import useLoadingStore from '../infra/shared/store/useLoadingStore'

// Configure base URL (use Vite proxy in dev)
client.setConfig({ baseUrl: '' })

// --- Global in-flight tracking for the subtle top loading bar ---
// Header that opts a request OUT of the loading indicator. Background pollers
// (recording status, autosave, …) set it so they don't make the bar flicker.
export const SILENT_HEADER = 'x-silent-loading'
// Spread into a generated SDK call's options to mark a SINGLE call silent, e.g.
//   listRecordingsApi({ path: { session_id }, ...silent() })
export const silent = () => ({ headers: { [SILENT_HEADER]: '1' } })

// Scope-based opt-out for code paths that fan out to many SDK calls (e.g. the
// course-info autosave, which upserts several sections). Every request created
// while the wrapped promise is pending is treated as silent — far less invasive
// than threading a flag through each api signature.
let silentDepth = 0
export async function runSilent<T>(fn: () => Promise<T>): Promise<T> {
  silentDepth++
  try {
    return await fn()
  } finally {
    silentDepth--
  }
}

// Correlate a counted request with its settlement WITHOUT leaking the marker
// header to the server. The same Request object is handed to the response/error
// interceptors (see generated client.gen.ts), so a WeakSet membership test tells
// us whether to decrement. Entries are GC'd automatically if a request is ever
// abandoned, so this can't leak.
const countedRequests = new WeakSet<Request>()

client.interceptors.request.use((request) => {
  try {
    const isSilent = silentDepth > 0 || !!request.headers.get(SILENT_HEADER)
    if (isSilent) {
      // Opt-out: strip any marker so it never reaches the network, don't count.
      request.headers.delete(SILENT_HEADER)
      return request
    }
    countedRequests.add(request)
    useLoadingStore.getState().start()
  } catch {
    // Never let bookkeeping break a request.
  }
  return request
})

const settle = (request: Request) => {
  if (countedRequests.has(request)) {
    countedRequests.delete(request)
    useLoadingStore.getState().done()
  }
}

client.interceptors.response.use((response, request) => {
  settle(request)
  return response
})

client.interceptors.error.use((error, _response, request) => {
  settle(request)
  return error
})

// --- Auth middleware: inject Bearer token on every request ---
client.interceptors.request.use((request) => {
  const token = localStorage.getItem('access_token')
  if (token) {
    request.headers.set('Authorization', `Bearer ${token}`)
  }
  return request
})

// --- Auto-refresh on 401 ---
// The refresh_token travels as an HttpOnly cookie — the browser sends it
// automatically. We never read or write it from JavaScript.
client.interceptors.response.use(async (response, request) => {
  // Skip refresh logic for auth endpoints — let the caller handle those errors
  const isAuthEndpoint = request.url.includes('/auth/login') ||
    request.url.includes('/auth/refresh') ||
    request.url.includes('/auth/register')

  if (response.status === 401 && !request.headers.get('X-Retry') && !isAuthEndpoint) {
    try {
      // No body needed — the HttpOnly cookie is sent automatically.
      const res = await fetch('/api/v1/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      })
      if (res.ok) {
        const json = await res.json()
        const newAccessToken: string = json.data.access_token
        localStorage.setItem('access_token', newAccessToken)

        const retryReq = new Request(request, {
          headers: new Headers(request.headers),
        })
        retryReq.headers.set('Authorization', `Bearer ${newAccessToken}`)
        retryReq.headers.set('X-Retry', 'true')
        return fetch(retryReq)
      }
    } catch {
      // refresh failed — fall through to logout
    }
    localStorage.removeItem('access_token')
    window.location.href = '/login'
  }
  return response
})

// --- Capture server-error detail for the UI ---
// On 5xx the backend (in DEBUG mode) returns a trimmed traceback in
// `error.details` plus a `request_id`. Stash it so the error banner can expand it.
client.interceptors.response.use(async (response) => {
  if (response.status >= 500) {
    try {
      const json = await response.clone().json()
      const err = json?.error
      if (err?.request_id && err.request_id !== '-') {
        useServerErrorStore.getState().setLast({
          requestId: err.request_id,
          details: Array.isArray(err.details)
            ? err.details.filter((d: unknown): d is string => typeof d === 'string')
            : [],
        })
      }
    } catch {
      // non-JSON body — nothing to capture
    }
  }
  return response
})

export { client }
