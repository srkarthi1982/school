import {
  useDataChannel,
  useLocalParticipant,
  useParticipants,
} from '@livekit/components-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  HiOutlineChevronDown,
  HiOutlineChevronRight,
  HiOutlineEllipsisVertical,
  HiOutlineHandRaised,
  HiOutlineMegaphone,
  HiOutlineUserGroup,
  HiOutlineVideoCamera,
  HiOutlineXMark,
} from 'react-icons/hi2'
import { create } from 'zustand'
import { useShallow } from 'zustand/react/shallow'
import { useI18n } from '../../../../infra/locales/I18nContext'
import useToastStore from '../../../../infra/shared/store/useToastStore'
import { extractErrorMessage, throwIfError } from '../../../../infra/shared/utils/apiError'
import {
  broadcastToBreakoutsApi,
  closeBreakoutApi,
  createBreakoutApi,
  joinBreakoutApi,
  joinClassSessionApi,
  listBreakoutsApi,
  moveBreakoutParticipantApi,
  requestHelpInBreakoutApi,
} from '../api'
import { notificationSocket } from '../../notification/services/notificationSocket'
import { useRecordingState } from './Recording'
import useClassroomStore from '../classroomStore'

// Breakout rooms ride on LiveKit's native room concept: the backend
// pre-creates a child room and mints fresh tokens for invitees. The
// host's frontend pushes those tokens via the `classroom-breakout`
// data-channel topic, addressed to specific identities. Each invitee's
// <BreakoutSync> picks up the message and calls `switchRoom`, which
// flips the active token and triggers the keyed <LiveKitRoom> to
// remount + reconnect to the new room.
//
// Returning to the parent room follows the same shape — the host
// closes the breakout, the backend mints parent-room tokens, the host
// pushes them out, the same Sync handler swaps everyone back.

const TOPIC = 'classroom-breakout'

type InvitePayload = {
  type: 'breakout-invite' | 'breakout-return'
  token: string
  roomName: string
  isHost: boolean
  /** Breakout child session id when type='breakout-invite'; null on return. */
  breakoutId: number | null
}

type HostBreakoutInvitee = {
  userId: number
  identity: string
  name: string
}

type HostBreakoutEntry = {
  breakoutId: number
  name: string
  invitees: HostBreakoutInvitee[]
  /** ISO-8601 timestamp when this breakout should auto-close. NULL means
   *  no timer (host-managed manual close). */
  expiresAt: string | null
}

type BreakoutHostStore = {
  active: HostBreakoutEntry[]
  add: (entry: HostBreakoutEntry) => void
  remove: (breakoutId: number) => void
  replaceAll: (entries: HostBreakoutEntry[]) => void
  /** Optimistic local move: pull invitee out of `sourceId` and append to
   *  `targetId`. The backend has already accepted the move; this just
   *  keeps the host's panel in sync without waiting for a refetch. */
  moveInviteeLocal: (sourceId: number, targetId: number, userId: number) => void
  reset: () => void
}

const useHostBreakouts = create<BreakoutHostStore>((set) => ({
  active: [],
  add: (entry) => set((s) => ({ active: [...s.active, entry] })),
  remove: (breakoutId) =>
    set((s) => ({ active: s.active.filter((b) => b.breakoutId !== breakoutId) })),
  replaceAll: (entries) => set({ active: entries }),
  moveInviteeLocal: (sourceId, targetId, userId) =>
    set((s) => {
      const sourceEntry = s.active.find((b) => b.breakoutId === sourceId)
      const moving = sourceEntry?.invitees.find((i) => i.userId === userId)
      if (!moving) return s
      return {
        active: s.active.map((b) => {
          if (b.breakoutId === sourceId) {
            return { ...b, invitees: b.invitees.filter((i) => i.userId !== userId) }
          }
          if (b.breakoutId === targetId) {
            if (b.invitees.some((i) => i.userId === userId)) return b
            return { ...b, invitees: [...b.invitees, moving] }
          }
          return b
        }),
      }
    }),
  reset: () => set({ active: [] }),
}))

// =====================================================================
// Sync — the per-client listener that consumes invite/return messages.
// Mount once inside the LiveKit room, regardless of role.
// =====================================================================
export function BreakoutSync() {
  const switchRoom = useClassroomStore((s) => s.switchRoom)
  const handler = useCallback(
    (msg: { payload: Uint8Array }) => {
      try {
        const text = new TextDecoder().decode(msg.payload)
        const data = JSON.parse(text) as InvitePayload
        if (data.type === 'breakout-invite' || data.type === 'breakout-return') {
          switchRoom({
            token: data.token,
            roomName: data.roomName,
            isHost: data.isHost,
            breakoutId: data.type === 'breakout-invite' ? data.breakoutId : null,
          })
        }
      } catch {
        // ignore malformed payloads
      }
    },
    [switchRoom],
  )
  useDataChannel(TOPIC, handler)
  return null
}

// =====================================================================
// Student-side listener for cross-room breakout signals.
//
// The host's frontend cannot data-channel a student in a different
// LiveKit room (parent vs. child), so the move-between-breakouts and
// breakout-closed signals ride on the existing notification WebSocket
// (mounted globally for all logged-in users).
//
// Handled notification types for the current session:
//   breakout.move   → mint a token for the target breakout via
//                     /breakouts/{tid}/join, switchRoom.
//   breakout.return → mint a token for the parent session via /join,
//                     switchRoom (breakoutId=null).
//
// Tokens deliberately don't ride inside the notification payload —
// notifications are persisted in the DB and we want to keep JWTs out
// of long-term storage.
// =====================================================================
export function BreakoutMoveListener() {
  const switchRoom = useClassroomStore((s) => s.switchRoom)
  const sessionId = useClassroomStore((s) => s.active?.id ?? null)

  useEffect(() => {
    if (!sessionId) return
    const unsubscribe = notificationSocket.subscribe(async (event) => {
      if (event.type !== 'notification.new') return
      const note = event.notification
      const payload = (note.payload ?? {}) as {
        session_id?: number
        target_breakout_id?: number
        source_breakout_id?: number
      }
      if (payload.session_id !== sessionId) return

      if (note.type === 'breakout.move') {
        const targetId = payload.target_breakout_id
        if (typeof targetId !== 'number') return
        try {
          const { data, error } = await joinBreakoutApi({
            path: { session_id: sessionId, breakout_id: targetId },
          })
          if (error) {
            console.error('[breakout.move] join failed', error)
            return
          }
          const token = (data as {
            data: { token: string; room_name: string; is_host: boolean }
          }).data
          switchRoom({
            token: token.token,
            roomName: token.room_name,
            isHost: token.is_host,
            breakoutId: targetId,
          })
        } catch (err) {
          console.error('[breakout.move] handler error', err)
        }
      } else if (note.type === 'breakout.return') {
        try {
          const { data, error } = await joinClassSessionApi({
            path: { session_id: sessionId },
          })
          if (error) {
            console.error('[breakout.return] join failed', error)
            return
          }
          const token = (data as {
            data: { token: string; room_name: string; is_host: boolean }
          }).data
          switchRoom({
            token: token.token,
            roomName: token.room_name,
            isHost: token.is_host,
            breakoutId: null,
          })
        } catch (err) {
          console.error('[breakout.return] handler error', err)
        }
      }
    })
    return unsubscribe
  }, [sessionId, switchRoom])

  return null
}

// =====================================================================
// Host-only: rehydrate breakout panel from server on (re)join.
// Mount once at LiveKitRoom level so the host's local view of active
// breakouts survives a page refresh. Backend filters to status='LIVE'
// children, so closed/ended breakouts are not re-shown.
// =====================================================================
export function BreakoutHostHydrator() {
  const isHost = useClassroomStore((s) => s.active?.isHost ?? false)
  const sessionId = useClassroomStore((s) => s.active?.id ?? null)
  const replaceAll = useHostBreakouts((s) => s.replaceAll)
  const reset = useHostBreakouts((s) => s.reset)

  useEffect(() => {
    if (!isHost || !sessionId) {
      reset()
      return
    }
    let cancelled = false
    const load = async () => {
      try {
        const { data, error } = await listBreakoutsApi({
          path: { session_id: sessionId },
        })
        if (cancelled || error) return
        const summaries = (data as {
          data: {
            breakout_id: number
            name: string
            invitees: { user_id: number; identity: string; name: string }[]
            expires_at: string | null
          }[]
        }).data
        replaceAll(
          summaries.map((s) => ({
            breakoutId: s.breakout_id,
            name: s.name,
            invitees: s.invitees.map((i) => ({
              userId: i.user_id,
              identity: i.identity,
              name: i.name,
            })),
            expiresAt: s.expires_at,
          })),
        )
      } catch {
        // Silent — failing to rehydrate just means the host sees an empty
        // panel until they create a new breakout. Closing existing ones
        // still works because the backend remains the source of truth.
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [isHost, sessionId, replaceAll, reset])

  return null
}

// =====================================================================
// Student-only (inside a breakout): tap to alert the host. Host-side a
// notification toast appears (via existing notification WS pipeline)
// with the breakout name and student name. Cooldown prevents spam.
// =====================================================================
const HELP_COOLDOWN_MS = 30_000

export function AskForHelpButton() {
  const { t } = useI18n()
  const sessionId = useClassroomStore((s) => s.active?.id ?? null)
  const breakoutId = useClassroomStore((s) => s.active?.breakoutId ?? null)
  const isHost = useClassroomStore((s) => s.active?.isHost ?? false)
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (state !== 'sent') return
    const handle = window.setTimeout(() => setState('idle'), HELP_COOLDOWN_MS)
    return () => window.clearTimeout(handle)
  }, [state])

  // Reset state when the student leaves the breakout (return to parent
  // room or session end). Without this, the button would stay in 'sent'
  // for the rest of the cooldown after they've already returned.
  useEffect(() => {
    if (!breakoutId) {
      setState('idle')
      setError(null)
    }
  }, [breakoutId])

  if (!sessionId || !breakoutId || isHost) return null

  const ask = async () => {
    if (state !== 'idle') return
    setError(null)
    setState('sending')
    try {
      const { error: apiError } = await requestHelpInBreakoutApi({
        path: { session_id: sessionId, breakout_id: breakoutId },
      })
      throwIfError(apiError)
      setState('sent')
    } catch (e: unknown) {
      setError(extractErrorMessage(e))
      setState('idle')
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={ask}
        disabled={state !== 'idle'}
        title={
          state === 'sent'
            ? t('virtualClassroom.live.helpRequestSent')
            : t('virtualClassroom.live.askForHelp')
        }
        className={[
          'absolute top-3 start-3 z-30 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full',
          'text-xs font-semibold border-none cursor-pointer shadow-elevated transition-colors disabled:opacity-60',
          state === 'sent'
            ? 'bg-emerald-500 text-white'
            : 'bg-amber-500 text-white hover:opacity-90',
        ].join(' ')}
      >
        <HiOutlineHandRaised className="text-[15px]" />
        <span className="hidden md:inline">
          {state === 'sent'
            ? t('virtualClassroom.live.helpRequestSent')
            : state === 'sending'
              ? t('virtualClassroom.live.helpRequesting')
              : t('virtualClassroom.live.askForHelp')}
        </span>
      </button>
      {error && (
        <div className="absolute top-14 start-3 z-30 max-w-xs px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-600 text-[11px] shadow-elevated">
          {error}
        </div>
      )}
    </>
  )
}

// =====================================================================
// Host-only: floating button that opens the breakout creation modal.
// =====================================================================
export function BreakoutHostControls() {
  const { t } = useI18n()
  const isHost = useClassroomStore((s) => s.active?.isHost ?? false)
  const [showModal, setShowModal] = useState(false)
  const [showBroadcast, setShowBroadcast] = useState(false)
  const hostBreakouts = useHostBreakouts((s) => s.active)
  if (!isHost) return null
  return (
    <>
      <button
        type="button"
        onClick={() => setShowModal(true)}
        title={t('virtualClassroom.live.breakoutCreate')}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-surface text-primary hover:bg-surface-2 border-none cursor-pointer shadow-elevated"
      >
        <HiOutlineUserGroup className="text-[15px]" />
        <span className="hidden md:inline">
          {t('virtualClassroom.live.breakouts')}
          {hostBreakouts.length > 0 ? ` (${hostBreakouts.length})` : ''}
        </span>
        {hostBreakouts.length > 0 && (
          <span className="md:hidden text-[10px] font-bold">{hostBreakouts.length}</span>
        )}
      </button>
      {hostBreakouts.length > 0 && (
        <button
          type="button"
          onClick={() => setShowBroadcast(true)}
          title={t('virtualClassroom.live.breakoutBroadcast')}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-surface text-primary hover:bg-surface-2 border-none cursor-pointer shadow-elevated"
        >
          <HiOutlineMegaphone className="text-[15px]" />
          <span className="hidden md:inline">
            {t('virtualClassroom.live.breakoutBroadcast')}
          </span>
        </button>
      )}
      {showModal && <BreakoutCreateModal onClose={() => setShowModal(false)} />}
      {showBroadcast && (
        <BreakoutBroadcastModal onClose={() => setShowBroadcast(false)} />
      )}
    </>
  )
}

// =====================================================================
// Modal: host types a message that is delivered to every participant
// across every active breakout. Backend fan-outs via notify_users_and_push
// so students see it as a notification toast in their breakout room view.
// =====================================================================
function BreakoutBroadcastModal({ onClose }: { onClose: () => void }) {
  const { t } = useI18n()
  const sessionId = useClassroomStore((s) => s.active?.id ?? null)
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sentInfo, setSentInfo] = useState<{ recipients: number; breakouts: number } | null>(null)

  const submit = async () => {
    if (!sessionId) return
    const text = message.trim()
    if (!text) {
      setError(t('virtualClassroom.live.breakoutBroadcastEmpty'))
      return
    }
    setSending(true)
    setError(null)
    try {
      const { data, error: apiError } = await broadcastToBreakoutsApi({
        path: { session_id: sessionId },
        body: { message: text },
      })
      throwIfError(apiError)
      const result = (data as {
        data: { recipients: number; breakouts: number }
      }).data
      setSentInfo(result)
      // Auto-close after a short pause so host sees the confirmation.
      window.setTimeout(onClose, 1200)
    } catch (e: unknown) {
      setError(extractErrorMessage(e))
    } finally {
      setSending(false)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 z-40 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="bg-surface rounded-2xl border border-bd shadow-elevated w-[90%] max-w-md max-h-[80vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="px-5 py-3 shrink-0"
          style={{ background: 'linear-gradient(135deg, var(--navy) 0%, var(--navy-mid) 100%)' }}
        >
          <p className="text-[13px] font-bold text-white">
            {t('virtualClassroom.live.breakoutBroadcast')}
          </p>
          <p className="text-[11px] text-white/55 mt-0.5">
            {t('virtualClassroom.live.breakoutBroadcastHint')}
          </p>
        </div>
        <div className="p-4 overflow-y-auto flex-1 flex flex-col gap-3">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={500}
            rows={4}
            placeholder={t('virtualClassroom.live.breakoutBroadcastPlaceholder')}
            disabled={sending || sentInfo !== null}
            className="w-full px-3 py-2 bg-surface-2 border border-bd rounded-lg text-primary text-sm focus:outline-none focus:border-accent resize-none disabled:opacity-60"
          />
          <p className="text-[11px] text-muted text-end">
            {message.length}/500
          </p>
          {sentInfo && (
            <div className="px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs">
              {t('virtualClassroom.live.breakoutBroadcastSent')
                .replace('{recipients}', String(sentInfo.recipients))
                .replace('{breakouts}', String(sentInfo.breakouts))}
            </div>
          )}
          {error && (
            <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-600 text-xs">
              {error}
            </div>
          )}
        </div>
        <div className="px-4 py-3 border-t border-bd bg-surface-2 flex justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={sending}
            className="py-1.5 px-3 rounded-lg text-xs font-medium text-secondary border border-bd bg-surface hover:bg-surface-2 cursor-pointer disabled:opacity-50"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={sending || sentInfo !== null || !message.trim()}
            className="py-1.5 px-3 rounded-lg text-xs font-semibold bg-accent text-white hover:opacity-90 cursor-pointer disabled:opacity-50"
          >
            {t('virtualClassroom.live.breakoutBroadcastSend')}
          </button>
        </div>
      </div>
    </div>
  )
}

// =====================================================================
// Modal: create one or more breakouts at once. Host picks the number of
// rooms, optionally hits "Auto-assign randomly" to round-robin peers into
// rooms, or assigns each peer manually via the per-peer room dropdown.
// Submit fires one /breakouts request per room in parallel; each success
// triggers its own data-channel broadcast to its invitees.
// =====================================================================
const ROOM_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']
const DEFAULT_ROOM_COUNT = 2
const MAX_ROOM_COUNT = 10
// Allowed countdown durations, in minutes. 0 = no timer (default).
const DURATION_OPTIONS = [0, 5, 10, 15, 30, 45, 60] as const

const defaultRoomName = (idx: number): string =>
  `Group ${ROOM_LETTERS[idx] ?? idx + 1}`

const UNASSIGNED = -1

function BreakoutCreateModal({ onClose }: { onClose: () => void }) {
  const { t } = useI18n()
  const participants = useParticipants()
  const { localParticipant } = useLocalParticipant()
  const { send } = useDataChannel(TOPIC)
  const sessionId = useClassroomStore((s) => s.active?.id)
  const addHostBreakout = useHostBreakouts((s) => s.add)

  const peers = participants.filter(
    (p) => p.identity !== localParticipant?.identity,
  )

  const [numRooms, setNumRooms] = useState(DEFAULT_ROOM_COUNT)
  const [durationMinutes, setDurationMinutes] = useState<number>(0)
  const [roomNames, setRoomNames] = useState<string[]>(() =>
    Array.from({ length: DEFAULT_ROOM_COUNT }, (_, i) => defaultRoomName(i)),
  )
  // identity → room index (UNASSIGNED means not placed yet)
  const [assignments, setAssignments] = useState<Record<string, number>>({})
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Keep roomNames length in sync with numRooms, and clear assignments
  // pointing at rooms that no longer exist.
  useEffect(() => {
    setRoomNames((prev) => {
      if (prev.length === numRooms) return prev
      if (prev.length < numRooms) {
        return [
          ...prev,
          ...Array.from({ length: numRooms - prev.length }, (_, i) =>
            defaultRoomName(prev.length + i),
          ),
        ]
      }
      return prev.slice(0, numRooms)
    })
    setAssignments((prev) => {
      let dirty = false
      const next: Record<string, number> = {}
      for (const [k, v] of Object.entries(prev)) {
        if (v >= numRooms) {
          dirty = true
          continue
        }
        next[k] = v
      }
      return dirty ? next : prev
    })
  }, [numRooms])

  const renameRoom = (idx: number, value: string) => {
    setRoomNames((prev) => prev.map((n, i) => (i === idx ? value : n)))
  }

  const assignTo = (identity: string, roomIdx: number) => {
    setAssignments((prev) => {
      const next = { ...prev }
      if (roomIdx === UNASSIGNED) delete next[identity]
      else next[identity] = roomIdx
      return next
    })
  }

  const autoAssign = () => {
    // Fisher-Yates would be more "correct", but with ≤10 rooms and a few
    // dozen peers, sort-by-random is good enough for visual fairness and
    // keeps the code one line.
    const shuffled = [...peers].sort(() => Math.random() - 0.5)
    const next: Record<string, number> = {}
    shuffled.forEach((p, i) => {
      next[p.identity] = i % numRooms
    })
    setAssignments(next)
  }

  const clearAssignments = () => setAssignments({})

  const roomBuckets = roomNames.map((_, idx) =>
    peers.filter((p) => assignments[p.identity] === idx),
  )
  const unassigned = peers.filter((p) => assignments[p.identity] === undefined)

  const submit = async () => {
    if (!sessionId) return
    const emptyRooms = roomBuckets
      .map((bucket, idx) => ({ bucket, idx }))
      .filter(({ bucket }) => bucket.length === 0)
    if (emptyRooms.length > 0) {
      const names = emptyRooms.map((r) => roomNames[r.idx] || defaultRoomName(r.idx))
      setError(
        t('virtualClassroom.live.breakoutEmptyRooms').replace(
          '{rooms}',
          names.join(', '),
        ),
      )
      return
    }
    setSubmitting(true)
    setError(null)

    // Issue all room creates in parallel. Partial failures are surfaced
    // but the rooms that succeeded are still applied (broadcast tokens +
    // local store add) so the host doesn't lose their work.
    const requests = roomBuckets.map((bucket, idx) => {
      const ids = bucket
        .map((p) => Number(p.identity))
        .filter((n) => Number.isFinite(n) && n > 0)
      const name = roomNames[idx].trim() || defaultRoomName(idx)
      return createBreakoutApi({
        path: { session_id: sessionId },
        body: {
          name,
          participant_user_ids: ids,
          duration_minutes: durationMinutes > 0 ? durationMinutes : null,
        },
      }).then((res) => ({ idx, name, bucket, res }))
    })
    const results = await Promise.allSettled(requests)
    const failures: string[] = []
    for (const result of results) {
      if (result.status === 'rejected') {
        failures.push(extractErrorMessage(result.reason))
        continue
      }
      const { idx, name, bucket, res } = result.value
      const { data, error: apiError } = res
      if (apiError) {
        failures.push(`${name}: ${extractErrorMessage(apiError)}`)
        continue
      }
      const payload = (data as {
        data: {
          breakout_id: number
          tokens: { user_id: number; token: string; room_name: string; ws_url: string }[]
          expires_at: string | null
        }
      }).data
      for (const tok of payload.tokens) {
        const inviteMsg: InvitePayload = {
          type: 'breakout-invite',
          token: tok.token,
          roomName: tok.room_name,
          isHost: false,
          breakoutId: payload.breakout_id,
        }
        send(new TextEncoder().encode(JSON.stringify(inviteMsg)), {
          reliable: true,
          topic: TOPIC,
          destinationIdentities: [String(tok.user_id)],
        })
      }
      addHostBreakout({
        breakoutId: payload.breakout_id,
        name,
        invitees: bucket.map((p) => ({
          userId: Number(p.identity),
          identity: p.identity,
          name: p.name || p.identity,
        })),
        expiresAt: payload.expires_at,
      })
      // Drop just-created peers from `assignments` so a retry of the
      // remaining rooms doesn't re-invite them.
      setAssignments((prev) => {
        const next = { ...prev }
        for (const p of bucket) delete next[p.identity]
        return next
      })
      // Mark this slot as already-fulfilled by renaming it so a retry
      // doesn't double-create. We do this by collapsing numRooms below.
      void idx
    }
    setSubmitting(false)
    if (failures.length === 0) {
      onClose()
    } else {
      setError(failures.join('\n'))
    }
  }

  const allAssigned = roomBuckets.every((b) => b.length > 0)

  return (
    <div
      className="fixed inset-0 bg-black/60 z-40 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="bg-surface rounded-2xl border border-bd shadow-elevated w-[90%] max-w-2xl max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="px-5 py-3 shrink-0"
          style={{ background: 'linear-gradient(135deg, var(--navy) 0%, var(--navy-mid) 100%)' }}
        >
          <p className="text-[13px] font-bold text-white">
            {t('virtualClassroom.live.breakoutCreate')}
          </p>
          <p className="text-[11px] text-white/55 mt-0.5">
            {t('virtualClassroom.live.breakoutHint')}
          </p>
        </div>

        <div className="p-4 overflow-y-auto flex-1 flex flex-col gap-3">
          {/* Toolbar: room count + auto-assign + clear */}
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs font-medium text-secondary mb-1">
                {t('virtualClassroom.live.breakoutRoomCount')}
              </label>
              <input
                type="number"
                min={1}
                max={MAX_ROOM_COUNT}
                value={numRooms}
                onChange={(e) => {
                  const n = Math.max(
                    1,
                    Math.min(MAX_ROOM_COUNT, Number(e.target.value) || 1),
                  )
                  setNumRooms(n)
                }}
                className="w-20 px-2 py-1.5 bg-surface-2 border border-bd rounded-lg text-primary text-sm focus:outline-none focus:border-accent"
              />
            </div>
            <button
              type="button"
              onClick={autoAssign}
              disabled={peers.length === 0}
              className="py-1.5 px-3 rounded-lg text-xs font-semibold border border-bd bg-surface-2 hover:bg-surface text-primary cursor-pointer disabled:opacity-50"
            >
              {t('virtualClassroom.live.breakoutAutoAssign')}
            </button>
            <button
              type="button"
              onClick={clearAssignments}
              disabled={Object.keys(assignments).length === 0}
              className="py-1.5 px-3 rounded-lg text-xs font-medium border border-bd bg-surface hover:bg-surface-2 text-secondary cursor-pointer disabled:opacity-50"
            >
              {t('virtualClassroom.live.breakoutClearAssignments')}
            </button>
            <div className="ms-auto">
              <label className="block text-xs font-medium text-secondary mb-1">
                {t('virtualClassroom.live.breakoutDuration')}
              </label>
              <select
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
                className="px-2 py-1.5 bg-surface-2 border border-bd rounded-lg text-primary text-sm focus:outline-none focus:border-accent"
              >
                {DURATION_OPTIONS.map((d) => (
                  <option key={d} value={d}>
                    {d === 0
                      ? t('virtualClassroom.live.breakoutDurationNone')
                      : t('virtualClassroom.live.breakoutDurationMinutes').replace(
                          '{n}',
                          String(d),
                        )}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Room cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {roomNames.map((rname, idx) => (
              <div
                key={idx}
                className="border border-bd rounded-lg bg-surface-2 flex flex-col"
              >
                <div className="px-3 py-2 border-b border-bd flex items-center gap-2">
                  <input
                    type="text"
                    value={rname}
                    onChange={(e) => renameRoom(idx, e.target.value)}
                    maxLength={200}
                    className="flex-1 px-2 py-1 bg-surface border border-bd rounded text-primary text-sm focus:outline-none focus:border-accent"
                  />
                  <span className="text-[11px] font-bold text-muted">
                    {roomBuckets[idx].length}
                  </span>
                </div>
                <ul className="list-none p-0 m-0 max-h-32 overflow-y-auto">
                  {roomBuckets[idx].length === 0 ? (
                    <li className="text-[11px] text-muted italic px-3 py-2">
                      {t('virtualClassroom.live.breakoutNoPeersInRoom')}
                    </li>
                  ) : (
                    roomBuckets[idx].map((p) => (
                      <li
                        key={p.identity}
                        className="flex items-center gap-2 px-3 py-1.5 text-xs border-b border-bd last:border-b-0"
                      >
                        <span className="flex-1 truncate text-primary">
                          {p.name || p.identity}
                        </span>
                        <button
                          type="button"
                          onClick={() => assignTo(p.identity, UNASSIGNED)}
                          title={t('virtualClassroom.live.breakoutUnassign')}
                          className="p-0.5 rounded hover:bg-rose-50 hover:text-rose-600 cursor-pointer text-muted border-none bg-transparent"
                        >
                          <HiOutlineXMark className="text-[12px]" />
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              </div>
            ))}
          </div>

          {/* Unassigned list with per-row room picker */}
          <div>
            <label className="block text-xs font-medium text-secondary mb-1">
              {t('virtualClassroom.live.breakoutUnassigned')} ({unassigned.length})
            </label>
            <div className="border border-bd rounded-lg max-h-40 overflow-y-auto bg-surface-2">
              {peers.length === 0 ? (
                <div className="text-xs text-muted text-center py-4">
                  {t('virtualClassroom.live.breakoutNoPeers')}
                </div>
              ) : unassigned.length === 0 ? (
                <div className="text-xs text-muted text-center py-3">
                  {t('virtualClassroom.live.breakoutAllAssigned')}
                </div>
              ) : (
                unassigned.map((p) => (
                  <div
                    key={p.identity}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm border-b border-bd last:border-b-0"
                  >
                    <span className="flex-1 truncate text-primary">
                      {p.name || p.identity}
                    </span>
                    <select
                      value={UNASSIGNED}
                      onChange={(e) => assignTo(p.identity, Number(e.target.value))}
                      className="text-xs px-2 py-1 bg-surface border border-bd rounded text-primary focus:outline-none focus:border-accent"
                    >
                      <option value={UNASSIGNED}>
                        {t('virtualClassroom.live.breakoutAssignToPlaceholder')}
                      </option>
                      {roomNames.map((rn, idx) => (
                        <option key={idx} value={idx}>
                          {rn || defaultRoomName(idx)}
                        </option>
                      ))}
                    </select>
                  </div>
                ))
              )}
            </div>
          </div>

          {error && (
            <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-600 text-xs whitespace-pre-line">
              {error}
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t border-bd bg-surface-2 flex justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="py-1.5 px-3 rounded-lg text-xs font-medium text-secondary border border-bd bg-surface hover:bg-surface-2 cursor-pointer disabled:opacity-50"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting || !allAssigned}
            className="py-1.5 px-3 rounded-lg text-xs font-semibold bg-accent text-white hover:opacity-90 cursor-pointer disabled:opacity-50"
          >
            {t('virtualClassroom.live.breakoutCreateAll')}
          </button>
        </div>
      </div>
    </div>
  )
}

// Tick once per second to drive countdown re-renders. Returns seconds
// remaining until `expiresAt` (negative if past). Returns null if
// `expiresAt` is null (no timer configured).
function useCountdownSeconds(expiresAt: string | null): number | null {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!expiresAt) return
    const handle = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(handle)
  }, [expiresAt])
  if (!expiresAt) return null
  return Math.floor((new Date(expiresAt).getTime() - now) / 1000)
}

function formatCountdown(seconds: number): string {
  const abs = Math.max(0, seconds)
  const m = Math.floor(abs / 60)
  const s = abs % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

// Per-row countdown pill. When the timer hits zero, fire `onExpire` once
// — used by BreakoutHostList to auto-close the breakout. Stays mounted
// while the breakout is in the panel, so the auto-close trigger is
// guaranteed as long as the host has the classroom UI open.
function BreakoutCountdownBadge({
  expiresAt,
  onExpire,
}: {
  expiresAt: string | null
  onExpire: () => void
}) {
  const seconds = useCountdownSeconds(expiresAt)
  const expiredRef = useRef(false)
  useEffect(() => {
    if (seconds === null) return
    if (seconds <= 0 && !expiredRef.current) {
      expiredRef.current = true
      onExpire()
    }
  }, [seconds, onExpire])
  if (seconds === null) return null
  const urgent = seconds <= 60
  return (
    <span
      className={[
        'px-1.5 py-0.5 rounded text-[10px] font-mono font-bold tabular-nums',
        urgent
          ? 'bg-rose-100 text-rose-700'
          : 'bg-surface-2 text-secondary border border-bd',
      ].join(' ')}
      title="Auto-close countdown"
    >
      {formatCountdown(seconds)}
    </span>
  )
}

// =====================================================================
// Host: list of breakouts I've spawned with a "close" button per row.
// =====================================================================
export function BreakoutHostList() {
  const { t } = useI18n()
  const isHost = useClassroomStore((s) => s.active?.isHost ?? false)
  const sessionId = useClassroomStore((s) => s.active?.id)
  const { send } = useDataChannel(TOPIC)
  const { active: hostBreakouts, remove, moveInviteeLocal } = useHostBreakouts(
    useShallow((s) => ({
      active: s.active,
      remove: s.remove,
      moveInviteeLocal: s.moveInviteeLocal,
    })),
  )
  const [closingId, setClosingId] = useState<number | null>(null)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [moveError, setMoveError] = useState<string | null>(null)
  const [movingKey, setMovingKey] = useState<string | null>(null)

  const moveInvitee = async (
    sourceBreakoutId: number,
    userId: number,
    targetBreakoutId: number,
  ) => {
    if (!sessionId) return
    const key = `${sourceBreakoutId}:${userId}`
    setMoveError(null)
    setMovingKey(key)
    try {
      const { error } = await moveBreakoutParticipantApi({
        path: { session_id: sessionId, breakout_id: sourceBreakoutId },
        body: { user_id: userId, target_breakout_id: targetBreakoutId },
      })
      throwIfError(error)
      moveInviteeLocal(sourceBreakoutId, targetBreakoutId, userId)
    } catch (e: unknown) {
      setMoveError(extractErrorMessage(e))
    } finally {
      setMovingKey(null)
    }
  }

  // Defensive cleanup when the user disconnects.
  useEffect(() => {
    return () => {
      // Note: we deliberately don't tear down the breakouts on unmount.
      // The host might be navigating to docked mode and come back. The
      // host can close them explicitly. (Or the parent /end will end
      // them server-side via cascade — but that's not implemented yet.)
    }
  }, [])

  if (!isHost || hostBreakouts.length === 0) return null

  const close = async (entry: HostBreakoutEntry) => {
    if (!sessionId) return
    setClosingId(entry.breakoutId)
    try {
      const { data, error } = await closeBreakoutApi({
        path: { session_id: sessionId, breakout_id: entry.breakoutId },
      })
      throwIfError(error)
      const payload = (data as { data: { tokens: { user_id: number; token: string; room_name: string }[] } }).data
      for (const tok of payload.tokens) {
        const msg: InvitePayload = {
          type: 'breakout-return',
          token: tok.token,
          roomName: tok.room_name,
          isHost: false,
          breakoutId: null,
        }
        send(new TextEncoder().encode(JSON.stringify(msg)), {
          reliable: true,
          topic: TOPIC,
          destinationIdentities: [String(tok.user_id)],
        })
      }
      remove(entry.breakoutId)
    } catch (e: unknown) {
      useToastStore.getState().push({ variant: 'error', title: (e as Error).message })
    } finally {
      setClosingId(null)
    }
  }

  return (
    <div
      data-classroom-panel=""
      className="absolute top-16 end-3 z-30 max-w-xs bg-surface border border-bd rounded-lg shadow-elevated overflow-hidden transition-[inset-inline-end]"
    >
      <div className="px-3 py-1.5 bg-surface-2 text-[11px] font-bold text-secondary uppercase tracking-wide flex items-center gap-1.5 border-b border-bd">
        <HiOutlineUserGroup className="text-[12px]" />
        {t('virtualClassroom.live.activeBreakouts')}
      </div>
      <ul className="text-xs list-none p-0 m-0">
        {hostBreakouts.map((b) => {
          const expanded = expandedId === b.breakoutId
          return (
            <li
              key={b.breakoutId}
              className="border-b border-bd last:border-b-0"
            >
              <div className="px-3 py-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setExpandedId(expanded ? null : b.breakoutId)}
                  className="p-0.5 rounded hover:bg-surface-2 cursor-pointer text-muted border-none bg-transparent"
                  title={expanded ? 'Collapse' : 'Expand'}
                  aria-expanded={expanded}
                >
                  {expanded ? (
                    <HiOutlineChevronDown className="text-[14px]" />
                  ) : (
                    <HiOutlineChevronRight className="text-[14px]" />
                  )}
                </button>
                <span className="flex-1 text-primary truncate font-medium">
                  {b.name}{' '}
                  <span className="text-muted font-normal">({b.invitees.length})</span>
                </span>
                <BreakoutCountdownBadge
                  expiresAt={b.expiresAt}
                  onExpire={() => close(b)}
                />
                <button
                  type="button"
                  onClick={() => close(b)}
                  disabled={closingId === b.breakoutId}
                  title={t('virtualClassroom.live.breakoutClose')}
                  className="p-1 rounded hover:bg-rose-50 hover:text-rose-600 cursor-pointer text-muted border-none bg-transparent disabled:opacity-50"
                >
                  <HiOutlineXMark className="text-[14px]" />
                </button>
              </div>
              {expanded && (
                <ul className="list-none p-0 m-0 bg-surface-2 border-t border-bd">
                  {b.invitees.length === 0 ? (
                    <li className="px-3 py-1.5 text-muted text-[11px] italic">
                      {t('virtualClassroom.live.breakoutNoPeers')}
                    </li>
                  ) : (
                    b.invitees.map((inv) => {
                      const otherRooms = hostBreakouts.filter(
                        (o) => o.breakoutId !== b.breakoutId,
                      )
                      const isMoving = movingKey === `${b.breakoutId}:${inv.userId}`
                      return (
                        <li
                          key={inv.identity}
                          className="px-3 py-1.5 text-[11px] text-secondary flex items-center gap-1.5"
                        >
                          <span className="flex-1 truncate">{inv.name}</span>
                          {otherRooms.length > 0 && (
                            <select
                              value=""
                              disabled={isMoving}
                              onChange={(e) => {
                                const targetId = Number(e.target.value)
                                if (Number.isFinite(targetId) && targetId > 0) {
                                  void moveInvitee(b.breakoutId, inv.userId, targetId)
                                }
                                e.currentTarget.selectedIndex = 0
                              }}
                              className="text-[10px] px-1.5 py-0.5 bg-surface border border-bd rounded text-primary focus:outline-none focus:border-accent disabled:opacity-50"
                            >
                              <option value="">
                                {t('virtualClassroom.live.breakoutMoveTo')}
                              </option>
                              {otherRooms.map((other) => (
                                <option
                                  key={other.breakoutId}
                                  value={other.breakoutId}
                                >
                                  {other.name}
                                </option>
                              ))}
                            </select>
                          )}
                        </li>
                      )
                    })
                  )}
                </ul>
              )}
            </li>
          )
        })}
      </ul>
      {moveError && (
        <div className="px-3 py-2 border-t border-bd bg-red-50 text-red-600 text-[11px]">
          {moveError}
        </div>
      )}
    </div>
  )
}

// =====================================================================
// Consolidated host control surface — single hamburger trigger that
// expands into a dropdown holding every host action plus the active
// breakouts list. Keeps the visible footprint to one icon button so
// the LiveKit chat panel never collides with our controls.
// =====================================================================
export function HostMenu() {
  const { t } = useI18n()
  const isHost = useClassroomStore((s) => s.active?.isHost ?? false)
  const sessionId = useClassroomStore((s) => s.active?.id ?? null)
  const { send } = useDataChannel(TOPIC)
  const { active: hostBreakouts, remove, moveInviteeLocal } = useHostBreakouts(
    useShallow((s) => ({
      active: s.active,
      remove: s.remove,
      moveInviteeLocal: s.moveInviteeLocal,
    })),
  )
  const recording = useRecordingState()

  const [open, setOpen] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [showBroadcast, setShowBroadcast] = useState(false)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [closingId, setClosingId] = useState<number | null>(null)
  const [moveError, setMoveError] = useState<string | null>(null)
  const [movingKey, setMovingKey] = useState<string | null>(null)
  const wrapperRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!isHost) return null

  const recordingActive = !!recording?.active
  const breakoutCount = hostBreakouts.length

  const closeBreakout = async (entry: HostBreakoutEntry) => {
    if (!sessionId) return
    setClosingId(entry.breakoutId)
    try {
      const { data, error } = await closeBreakoutApi({
        path: { session_id: sessionId, breakout_id: entry.breakoutId },
      })
      throwIfError(error)
      const payload = (data as {
        data: { tokens: { user_id: number; token: string; room_name: string }[] }
      }).data
      for (const tok of payload.tokens) {
        const msg: InvitePayload = {
          type: 'breakout-return',
          token: tok.token,
          roomName: tok.room_name,
          isHost: false,
          breakoutId: null,
        }
        send(new TextEncoder().encode(JSON.stringify(msg)), {
          reliable: true,
          topic: TOPIC,
          destinationIdentities: [String(tok.user_id)],
        })
      }
      remove(entry.breakoutId)
    } catch (e: unknown) {
      useToastStore.getState().push({ variant: 'error', title: (e as Error).message })
    } finally {
      setClosingId(null)
    }
  }

  const moveInvitee = async (
    sourceBreakoutId: number,
    userId: number,
    targetBreakoutId: number,
  ) => {
    if (!sessionId) return
    const key = `${sourceBreakoutId}:${userId}`
    setMoveError(null)
    setMovingKey(key)
    try {
      const { error } = await moveBreakoutParticipantApi({
        path: { session_id: sessionId, breakout_id: sourceBreakoutId },
        body: { user_id: userId, target_breakout_id: targetBreakoutId },
      })
      throwIfError(error)
      moveInviteeLocal(sourceBreakoutId, targetBreakoutId, userId)
    } catch (e: unknown) {
      setMoveError(extractErrorMessage(e))
    } finally {
      setMovingKey(null)
    }
  }

  return (
    <div ref={wrapperRef} className="relative hidden ">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={t('virtualClassroom.live.hostMenu')}
        className={[
          'relative inline-flex items-center justify-center w-9 h-9 rounded-full',
          'border-none cursor-pointer shadow-elevated transition-colors',
          open
            ? 'bg-accent text-white'
            : 'bg-surface text-primary hover:bg-surface-2',
        ].join(' ')}
      >
        <HiOutlineEllipsisVertical className="text-[18px]" />
        {/* Recording indicator dot — red pulse when active */}
        {recordingActive && (
          <span
            className="absolute -top-0.5 -end-0.5 w-2.5 h-2.5 rounded-full bg-red-500 ring-2 ring-surface animate-pulse"
            aria-label="Recording active"
          />
        )}
        {/* Breakout count badge — bottom-end so it doesn't collide with the rec dot */}
        {breakoutCount > 0 && (
          <span
            className="absolute -bottom-0.5 -end-0.5 min-w-[1rem] h-4 px-1 rounded-full bg-amber-500 text-white text-[9px] font-bold inline-flex items-center justify-center ring-2 ring-surface"
            aria-label={`${breakoutCount} active breakouts`}
          >
            {breakoutCount}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute top-full end-0 mt-2 w-72 max-h-[70vh] overflow-y-auto bg-surface border border-bd rounded-xl shadow-elevated"
        >
          {/* Quick actions */}
          <div className="p-1.5 flex flex-col">
            {recording && (
              <button
                type="button"
                onClick={() => {
                  void (recording.active ? recording.stop() : recording.start())
                }}
                disabled={recording.working}
                className={[
                  'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-start',
                  'border-none cursor-pointer disabled:opacity-50 transition-colors',
                  recording.active
                    ? 'text-red-600 hover:bg-red-50 bg-transparent'
                    : 'text-primary hover:bg-surface-2 bg-transparent',
                ].join(' ')}
              >
                {recording.active ? (
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                ) : (
                  <HiOutlineVideoCamera className="text-[16px]" />
                )}
                <span className="flex-1">
                  {recording.active
                    ? t('virtualClassroom.live.stopRecording')
                    : t('virtualClassroom.live.startRecording')}
                </span>
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setShowCreate(true)
                setOpen(false)
              }}
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-start text-primary hover:bg-surface-2 border-none bg-transparent cursor-pointer"
            >
              <HiOutlineUserGroup className="text-[16px]" />
              <span className="flex-1">
                {t('virtualClassroom.live.breakoutCreate')+'c'}
              </span>
            </button>
            <button
              type="button"
              disabled={breakoutCount === 0}
              onClick={() => {
                setShowBroadcast(true)
                setOpen(false)
              }}
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-start text-primary hover:bg-surface-2 border-none bg-transparent cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <HiOutlineMegaphone className="text-[16px]" />
              <span className="flex-1">
                {t('virtualClassroom.live.breakoutBroadcast')}
              </span>
            </button>
          </div>

          {recording?.error && (
            <div className="mx-3 mb-2 px-2.5 py-1.5 rounded-lg bg-red-50 border border-red-200 text-red-600 text-[11px]">
              {recording.error}
            </div>
          )}

          {/* Active breakouts list (only when present) */}
          {breakoutCount > 0 && (
            <>
              <div className="px-3 py-1.5 bg-surface-2 text-[11px] font-bold text-secondary uppercase tracking-wide flex items-center gap-1.5 border-y border-bd">
                <HiOutlineUserGroup className="text-[12px]" />
                {t('virtualClassroom.live.activeBreakouts')} ({breakoutCount})
              </div>
              <ul className="list-none p-0 m-0">
                {hostBreakouts.map((b) => {
                  const expanded = expandedId === b.breakoutId
                  return (
                    <li
                      key={b.breakoutId}
                      className="border-b border-bd last:border-b-0"
                    >
                      <div className="px-2 py-1.5 flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedId(expanded ? null : b.breakoutId)
                          }
                          className="p-0.5 rounded hover:bg-surface-2 cursor-pointer text-muted border-none bg-transparent"
                          aria-expanded={expanded}
                        >
                          {expanded ? (
                            <HiOutlineChevronDown className="text-[14px]" />
                          ) : (
                            <HiOutlineChevronRight className="text-[14px]" />
                          )}
                        </button>
                        <span className="flex-1 text-primary truncate font-medium text-xs">
                          {b.name}{' '}
                          <span className="text-muted font-normal">
                            ({b.invitees.length})
                          </span>
                        </span>
                        <BreakoutCountdownBadge
                          expiresAt={b.expiresAt}
                          onExpire={() => closeBreakout(b)}
                        />
                        <button
                          type="button"
                          onClick={() => closeBreakout(b)}
                          disabled={closingId === b.breakoutId}
                          title={t('virtualClassroom.live.breakoutClose')}
                          className="p-1 rounded hover:bg-rose-50 hover:text-rose-600 cursor-pointer text-muted border-none bg-transparent disabled:opacity-50"
                        >
                          <HiOutlineXMark className="text-[14px]" />
                        </button>
                      </div>
                      {expanded && (
                        <ul className="list-none p-0 m-0 bg-surface-2 border-t border-bd">
                          {b.invitees.length === 0 ? (
                            <li className="px-3 py-1.5 text-muted text-[11px] italic">
                              {t('virtualClassroom.live.breakoutNoPeers')}
                            </li>
                          ) : (
                            b.invitees.map((inv) => {
                              const otherRooms = hostBreakouts.filter(
                                (o) => o.breakoutId !== b.breakoutId,
                              )
                              const isMoving =
                                movingKey === `${b.breakoutId}:${inv.userId}`
                              return (
                                <li
                                  key={inv.identity}
                                  className="px-3 py-1.5 text-[11px] text-secondary flex items-center gap-1.5"
                                >
                                  <span className="flex-1 truncate">
                                    {inv.name}
                                  </span>
                                  {otherRooms.length > 0 && (
                                    <select
                                      value=""
                                      disabled={isMoving}
                                      onChange={(e) => {
                                        const targetId = Number(e.target.value)
                                        if (
                                          Number.isFinite(targetId) &&
                                          targetId > 0
                                        ) {
                                          void moveInvitee(
                                            b.breakoutId,
                                            inv.userId,
                                            targetId,
                                          )
                                        }
                                        e.currentTarget.selectedIndex = 0
                                      }}
                                      className="text-[10px] px-1.5 py-0.5 bg-surface border border-bd rounded text-primary focus:outline-none focus:border-accent disabled:opacity-50"
                                    >
                                      <option value="">
                                        {t('virtualClassroom.live.breakoutMoveTo')}
                                      </option>
                                      {otherRooms.map((other) => (
                                        <option
                                          key={other.breakoutId}
                                          value={other.breakoutId}
                                        >
                                          {other.name}
                                        </option>
                                      ))}
                                    </select>
                                  )}
                                </li>
                              )
                            })
                          )}
                        </ul>
                      )}
                    </li>
                  )
                })}
              </ul>
              {moveError && (
                <div className="px-3 py-2 border-t border-bd bg-red-50 text-red-600 text-[11px]">
                  {moveError}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {showCreate && <BreakoutCreateModal onClose={() => setShowCreate(false)} />}
      {showBroadcast && (
        <BreakoutBroadcastModal onClose={() => setShowBroadcast(false)} />
      )}
    </div>
  )
}
