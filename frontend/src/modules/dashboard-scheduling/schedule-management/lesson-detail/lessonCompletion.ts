// Shared bridge used by the quiz / form / survey take pages: when a student was
// sent there from a lesson (URL carries `?take=<id>&lessonCtx=<cid>:<lid>`), mark
// that content complete for the lesson on submit so it can't be retaken there.
import { markLessonCompletion, type LessonContentType } from './api'

export interface LessonCtx {
  cid: number
  lid: number
  take: number | null
}

// Parse `?lessonCtx=<cid>:<lid>` (+ optional `?take=<id>`) from a query string.
export function readLessonCtx(search: string): LessonCtx | null {
  const params = new URLSearchParams(search)
  const ctx = params.get('lessonCtx')
  if (!ctx) return null
  const [cidStr, lidStr] = ctx.split(':')
  const cid = Number(cidStr)
  const lid = Number(lidStr)
  if (!Number.isFinite(cid) || !Number.isFinite(lid)) return null
  const takeRaw = params.get('take')
  const take = takeRaw != null && takeRaw !== '' ? Number(takeRaw) : null
  return { cid, lid, take: take != null && Number.isFinite(take) ? take : null }
}

// Best-effort: if launched from a lesson, record completion. Never throws (the
// student's submission already succeeded; completion tracking is secondary).
//
// `ctx` may be an already-parsed LessonCtx (preferred — the take pages capture
// it into state before they strip it from the URL) or a raw query string to
// parse. Defaults to the current URL for callers that still have the params.
export async function completeLessonContentIfLinked(
  contentType: LessonContentType,
  contentId: number,
  ctx: LessonCtx | string | null = window.location.search,
): Promise<void> {
  const resolved = typeof ctx === 'string' ? readLessonCtx(ctx) : ctx
  if (!resolved) return
  try {
    await markLessonCompletion(resolved.cid, resolved.lid, contentType, contentId)
  } catch {
    // ignore — lesson detail re-fetch will reconcile state on next view
  }
}
