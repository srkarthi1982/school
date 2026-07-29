export function extractErrorMessage(error: unknown): string {
  const e = error as any
  if (!e) return 'An unexpected error occurred'
  if (typeof e === 'string') return e
  if (e.error?.message) {                                                // custom backend: { error: { message } }
    let msg: string = e.error.message
    // For unexpected server errors the backend includes a request id; append it
    // so it can be matched against the server logs when investigating.
    const rid = e.error.request_id
    if (e.error.code === 'INTERNAL_SERVER_ERROR' && rid && rid !== '-') {
      msg += ` (ref: ${rid})`
    }
    return msg
  }
  if (typeof e.detail === 'string') return e.detail                     // FastAPI default
  if (Array.isArray(e.detail)) return e.detail.map((d: any) => d.msg).join('; ')  // FastAPI validation
  if (typeof e.message === 'string') return e.message
  return 'An unexpected error occurred'
}

// Optional structured accessor — the unhandled-error handler (DEBUG mode) also
// returns a trimmed traceback in `error.details`, useful for an expandable view.
export function extractErrorDetails(error: unknown): string[] {
  const e = error as any
  const details = e?.error?.details
  return Array.isArray(details) ? details.filter((d): d is string => typeof d === 'string') : []
}

export function throwIfError(error: unknown): void {
  if (error) throw new Error(extractErrorMessage(error))
}
