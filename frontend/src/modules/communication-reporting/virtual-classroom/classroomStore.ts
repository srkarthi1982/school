import '../../../api/client'
import { create } from 'zustand'
import { throwIfError } from '../../../infra/shared/utils/apiError'
import { joinClassSessionApi } from './api'

export type ClassroomMode = 'fullscreen' | 'docked' | 'pip' | 'hidden'

export type ActiveSession = {
  id: number
  roomName: string
  token: string
  wsUrl: string
  identity: string
  /** Whether the joining user has host privileges in this session (host
   *  user or admin role). Drives screen-share UI gating. */
  isHost: boolean
  /** Set when this participant is currently in a breakout child room
   *  (via switchRoom from a breakout-invite). Null when in the parent
   *  room. Used by the AskForHelpButton to gate visibility and to
   *  address the help request to the right breakout. */
  breakoutId: number | null
}

type State = {
  active: ActiveSession | null
  mode: ClassroomMode
  isJoining: boolean
  joinError: string | null

  joinSession: (sessionId: number) => Promise<ActiveSession | null>
  leaveSession: () => void
  setMode: (mode: ClassroomMode) => void
  clearError: () => void
  /** Re-mints a fresh token for the currently-active session. Used by
   *  ClassroomMount when LiveKit reports an unclean disconnect (token
   *  expired, signal close) so the user is reconnected transparently. */
  refreshToken: () => Promise<void>
  /** Reads the persisted session id from localStorage (if any) and
   *  attempts to rejoin. Called from <App> after auth boot so a hard
   *  refresh during a class lands the user back in the room. */
  restoreFromStorage: () => Promise<void>
  /** Swap the underlying LiveKit credentials without resetting the
   *  active.id. Used by breakout invites/returns: the user is still
   *  semantically in the parent class session, but their WebRTC
   *  connection is in a child room. The token-keyed <LiveKitRoom>
   *  remounts and reconnects automatically. */
  switchRoom: (params: {
    token: string
    roomName: string
    isHost: boolean
    breakoutId: number | null
  }) => void
}

// G11 — persist just the session id (NOT the JWT, which expires and is
// sensitive). On boot we re-mint a fresh token via /join.
const PERSIST_KEY = 'jai.classroom.activeSessionId'

function persistSessionId(id: number | null) {
  try {
    if (id == null) localStorage.removeItem(PERSIST_KEY)
    else localStorage.setItem(PERSIST_KEY, String(id))
  } catch {
    // Storage might be disabled (private mode, quota); skipping persistence
    // is acceptable — the only loss is auto-rejoin after refresh.
  }
}

function readPersistedSessionId(): number | null {
  try {
    const raw = localStorage.getItem(PERSIST_KEY)
    if (!raw) return null
    const n = Number(raw)
    return Number.isFinite(n) && n > 0 ? n : null
  } catch {
    return null
  }
}

const useClassroomStore = create<State>((set, get) => ({
  active: null,
  mode: 'hidden',
  isJoining: false,
  joinError: null,

  joinSession: async (sessionId) => {
    set({ isJoining: true, joinError: null })
    try {
      const { data, error } = await joinClassSessionApi({
        path: { session_id: sessionId },
      })
      throwIfError(error)
      const payload = (data as { data: { token: string; ws_url: string; room_name: string; identity: string; is_host: boolean } }).data
      const next: ActiveSession = {
        id: sessionId,
        roomName: payload.room_name,
        token: payload.token,
        wsUrl: payload.ws_url,
        identity: payload.identity,
        isHost: payload.is_host,
        breakoutId: null,
      }
      const previous = get().active
      // Keep mode='fullscreen' on first join; on a refresh-token call
      // preserve whatever mode the user is in (docked, pip, ...).
      const nextMode = previous && previous.id === sessionId ? get().mode : 'fullscreen'
      set({ active: next, mode: nextMode })
      persistSessionId(sessionId)
      return next
    } catch (e: unknown) {
      set({ joinError: (e as Error).message, active: null, mode: 'hidden' })
      persistSessionId(null)
      return null
    } finally {
      set({ isJoining: false })
    }
  },

  leaveSession: () => {
    set({ active: null, mode: 'hidden' })
    persistSessionId(null)
  },

  setMode: (mode) => set({ mode }),
  clearError: () => set({ joinError: null }),

  refreshToken: async () => {
    const current = get().active
    if (!current) return
    await get().joinSession(current.id)
  },

  switchRoom: ({ token, roomName, isHost, breakoutId }) => {
    const current = get().active
    if (!current) return
    set({
      active: {
        ...current,
        token,
        roomName,
        isHost,
        breakoutId,
      },
    })
  },

  restoreFromStorage: async () => {
    if (get().active) return
    const sessionId = readPersistedSessionId()
    if (!sessionId) return
    await get().joinSession(sessionId)
  },
}))

export default useClassroomStore
