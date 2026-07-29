import { useEffect, useState } from 'react'
import { HiOutlineVideoCamera } from 'react-icons/hi2'
import { useI18n } from '../../../../infra/locales/I18nContext'
import { extractErrorMessage, throwIfError } from '../../../../infra/shared/utils/apiError'
import { listRecordingsApi, startRecordingApi, stopRecordingApi } from '../api'
import { silent } from '../../../../api/client'
import useClassroomStore from '../classroomStore'

// Recording control. Host-only — gated by classroomStore.active.isHost,
// which the backend stamps based on session host_user_id / admin role.
//
// The backend talks to LiveKit Egress; without Egress + Redis deployed
// (see docs/operations/livekit-recording.md) /recordings POST returns
// HTTP 502 with the LiveKit error verbatim, which we surface inline.
//
// State machine (driven by webhooks): STARTING → ACTIVE → FINISHED.
// We poll list_recordings every 5s while the host's session is open
// to keep the local view fresh — fine for a small ops surface, no
// reason to bring in WebSocket for this v1.

type Recording = {
  id: number
  session_id: number
  egress_id: string
  status: 'STARTING' | 'ACTIVE' | 'FINISHED' | 'FAILED' | 'ABORTED'
  started_at: string
  ended_at: string | null
  file_path: string | null
  file_size_bytes: number | null
  duration_seconds: number | null
  error_message: string | null
}

function findActive(recs: Recording[]): Recording | null {
  return recs.find((r) => r.status === 'STARTING' || r.status === 'ACTIVE') ?? null
}

// Recording state machine + actions, reusable by any UI surface (the
// floating button, the host menu item, etc.). Polls every 5s so the
// backend webhook-driven transitions reach the UI without a manual
// refresh. Returns null when there's no session to attach to.
export function useRecordingState(): {
  active: Recording | null
  working: boolean
  error: string | null
  start: () => Promise<void>
  stop: () => Promise<void>
} | null {
  const sessionId = useClassroomStore((s) => s.active?.id ?? null)
  const [recordings, setRecordings] = useState<Recording[]>([])
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!sessionId) {
      setRecordings([])
      return
    }
    let cancelled = false
    const tick = async () => {
      try {
        const { data, error: apiError } = await listRecordingsApi({
          path: { session_id: sessionId },
          ...silent(), // background poll — don't trip the top loading bar
        })
        throwIfError(apiError)
        if (cancelled) return
        setRecordings((data as { data: Recording[] }).data)
      } catch {
        // Silent — recoverable on next tick.
      }
    }
    void tick()
    const handle = window.setInterval(tick, 5000)
    return () => {
      cancelled = true
      window.clearInterval(handle)
    }
  }, [sessionId])

  if (!sessionId) return null

  const active = findActive(recordings)

  const start = async () => {
    setError(null)
    setWorking(true)
    try {
      const { error: apiError } = await startRecordingApi({
        path: { session_id: sessionId },
      })
      throwIfError(apiError)
      const { data } = await listRecordingsApi({ path: { session_id: sessionId } })
      setRecordings((data as { data: Recording[] }).data)
    } catch (e: unknown) {
      setError(extractErrorMessage(e))
    } finally {
      setWorking(false)
    }
  }

  const stop = async () => {
    if (!active) return
    setError(null)
    setWorking(true)
    try {
      const { error: apiError } = await stopRecordingApi({
        path: { session_id: sessionId, recording_id: active.id },
      })
      throwIfError(apiError)
      const { data } = await listRecordingsApi({ path: { session_id: sessionId } })
      setRecordings((data as { data: Recording[] }).data)
    } catch (e: unknown) {
      setError(extractErrorMessage(e))
    } finally {
      setWorking(false)
    }
  }

  return { active, working, error, start, stop }
}

export function RecordingControl() {
  const { t } = useI18n()
  const isHost = useClassroomStore((s) => s.active?.isHost ?? false)
  const sessionId = useClassroomStore((s) => s.active?.id ?? null)
  const [recordings, setRecordings] = useState<Recording[]>([])
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Poll the list every 5s so STARTING -> ACTIVE -> FINISHED transitions
  // (driven by webhooks on the backend) become visible to the host.
  useEffect(() => {
    if (!sessionId) return
    let cancelled = false
    const tick = async () => {
      try {
        const { data, error: apiError } = await listRecordingsApi({
          path: { session_id: sessionId },
          ...silent(), // background poll — don't trip the top loading bar
        })
        throwIfError(apiError)
        if (cancelled) return
        const list = (data as { data: Recording[] }).data
        setRecordings(list)
      } catch {
        // Silent — list query failures are recoverable on the next tick.
      }
    }
    void tick()
    const handle = setInterval(tick, 5000)
    return () => {
      cancelled = true
      clearInterval(handle)
    }
  }, [sessionId])

  if (!isHost || !sessionId) return null

  const active = findActive(recordings)

  const start = async () => {
    setError(null)
    setWorking(true)
    try {
      const { error: apiError } = await startRecordingApi({
        path: { session_id: sessionId },
      })
      throwIfError(apiError)
      // Optimistically refetch so the badge flips immediately rather
      // than after the next 5-second tick.
      const { data } = await listRecordingsApi({ path: { session_id: sessionId } })
      setRecordings((data as { data: Recording[] }).data)
    } catch (e: unknown) {
      setError(extractErrorMessage(e))
    } finally {
      setWorking(false)
    }
  }

  const stop = async () => {
    if (!active) return
    setError(null)
    setWorking(true)
    try {
      const { error: apiError } = await stopRecordingApi({
        path: { session_id: sessionId, recording_id: active.id },
      })
      throwIfError(apiError)
      const { data } = await listRecordingsApi({ path: { session_id: sessionId } })
      setRecordings((data as { data: Recording[] }).data)
    } catch (e: unknown) {
      setError(extractErrorMessage(e))
    } finally {
      setWorking(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={active ? stop : start}
        disabled={working}
        title={active ? t('virtualClassroom.live.stopRecording') : t('virtualClassroom.live.startRecording')}
        className={[
          'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full',
          'text-xs font-semibold border-none cursor-pointer shadow-elevated transition-colors disabled:opacity-50',
          active
            ? 'bg-red-500 text-white hover:opacity-90'
            : 'bg-surface text-primary hover:bg-surface-2',
        ].join(' ')}
      >
        {active ? (
          <span className="w-2 h-2 rounded-full bg-white animate-pulse" aria-hidden />
        ) : (
          <HiOutlineVideoCamera className="text-[15px]" />
        )}
        <span className="hidden md:inline">
          {active ? t('virtualClassroom.live.stopRecording') : t('virtualClassroom.live.startRecording')}
        </span>
      </button>
      {error && (
        <div className="absolute top-14 end-3 z-30 max-w-xs px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-600 text-[11px] shadow-elevated">
          {error}
        </div>
      )}
    </>
  )
}

export function RecordingActiveBanner() {
  const sessionId = useClassroomStore((s) => s.active?.id ?? null)
  const [active, setActive] = useState<Recording | null>(null)

  // Everyone (not just the host) sees the "Recording" indicator. We
  // poll the same list endpoint — class_session:read covers students
  // by default.
  useEffect(() => {
    if (!sessionId) return
    let cancelled = false
    const tick = async () => {
      try {
        const { data } = await listRecordingsApi({
          path: { session_id: sessionId },
          ...silent(), // background poll — don't trip the top loading bar
        })
        if (cancelled) return
        const list = (data as { data: Recording[] }).data
        setActive(findActive(list))
      } catch {
        // Silent — the list call is read-only and recoverable.
      }
    }
    void tick()
    const handle = setInterval(tick, 5000)
    return () => {
      cancelled = true
      clearInterval(handle)
    }
  }, [sessionId])

  if (!active) return null
  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-red-500 text-white shadow-elevated pointer-events-none">
      <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" aria-hidden />
      REC
    </div>
  )
}
