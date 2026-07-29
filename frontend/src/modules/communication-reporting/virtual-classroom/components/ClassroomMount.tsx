import { LiveKitRoom } from '@livekit/components-react'
import '@livekit/components-styles'
import { DisconnectReason } from 'livekit-client'
import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'
import useClassroomStore from '../classroomStore'
import {
  BreakoutHostHydrator,
  BreakoutMoveListener,
  BreakoutSync,
} from './Breakout'
import DockedClassroom from './DockedClassroom'
import FullscreenClassroom from './FullscreenClassroom'
import { HandRaiseSync } from './HandRaise'
import PiPHost from './PiPHost'
import { getPipWindow, setPipWindow } from './pipWindow'

// Disconnect reasons we treat as "user/system intended this — go away
// cleanly". Anything else (signal close, server unreachable, token
// expiry on the server side) gets one auto-reconnect attempt with a
// freshly minted token before we give up.
const CLEAN_DISCONNECT_REASONS = new Set<DisconnectReason | undefined>([
  DisconnectReason.CLIENT_INITIATED,
  DisconnectReason.ROOM_DELETED,
  DisconnectReason.PARTICIPANT_REMOVED,
  DisconnectReason.DUPLICATE_IDENTITY,
  DisconnectReason.USER_REJECTED,
])

// Persistent mount for the active LiveKit room. Lives inside <main> so the
// desktop sidebar always stays visible. Auto-switches between two visual
// modes based on the URL:
//
//   - 'fullscreen' when the user is on /communication-reporting/virtual-classroom/:id/live: the
//     classroom fills the entire main content area (sidebar still visible).
//   - 'docked' when the user is anywhere else with an active session: a
//     compact bottom-right floating panel keeps the video/audio alive while
//     the user uses the rest of the app (open assignments, materials, etc).
//
// The single <LiveKitRoom> child stays mounted across mode swaps, so the
// underlying WebRTC connection is never torn down on navigation.
export default function ClassroomMount() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { active, mode, setMode, leaveSession, refreshToken } =
    useClassroomStore(
      useShallow((s) => ({
        active: s.active,
        mode: s.mode,
        setMode: s.setMode,
        leaveSession: s.leaveSession,
        refreshToken: s.refreshToken,
      })),
    )

  useEffect(() => {
    if (!active) return
    const onLiveRoute = pathname === `/communication-reporting/virtual-classroom/${active.id}/live`
    // Navigating onto /live always pulls the video back into the in-app
    // fullscreen view — including from PiP, since clicking the expand
    // button is an explicit "bring it back" gesture. Navigating between
    // non-live routes leaves PiP untouched (the user picked PiP on purpose,
    // it should follow them around the app, not auto-revert to docked).
    if (onLiveRoute && mode !== 'fullscreen') setMode('fullscreen')
    else if (!onLiveRoute && mode === 'fullscreen') setMode('docked')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, active?.id])

  // Close any leftover PiP window if the session ends or the user picks a
  // visible mode (fullscreen / docked / hidden) while a window is open.
  useEffect(() => {
    if (mode === 'pip') return
    const w = getPipWindow()
    if (w && !w.closed) w.close()
    setPipWindow(null)
  }, [mode])

  if (!active || mode === 'hidden') return null

  const sessionId = active.id

  let containerClass: string
  if (mode === 'fullscreen') {
    containerClass = 'absolute inset-0 z-20 bg-bg'
  } else if (mode === 'docked') {
    containerClass =
      'fixed bottom-20 lg:bottom-4 end-4 z-30 w-80 max-w-[calc(100vw-2rem)] rounded-xl shadow-elevated overflow-hidden bg-surface border border-bd flex flex-col'
  } else {
    // 'pip' — keep the LiveKit connection mounted in a 0-size off-screen
    // wrapper. The visible UI lives in the Document PiP window via PiPHost.
    containerClass = 'fixed top-0 start-0 w-0 h-0 overflow-hidden'
  }

  return (
    <div
      className={containerClass}
      data-lk-theme="default"
      data-classroom-host={active.isHost ? 'true' : 'false'}
    >
      <LiveKitRoom
        // Keying on the JWT forces a clean remount when refreshToken()
        // mints a new one, so the SDK reconnects with the fresh
        // credentials instead of trying to reuse the dead session.
        key={active.token}
        token={active.token}
        serverUrl={active.wsUrl}
        connect
        video
        audio
        onDisconnected={(reason) => {
          if (CLEAN_DISCONNECT_REASONS.has(reason)) {
            leaveSession()
            if (window.location.pathname.endsWith('/live')) {
              navigate(`/communication-reporting/virtual-classroom/${sessionId}`)
            }
            return
          }
          // G3 — unclean disconnect (signal close, token expiry server
          // side, brief network drop that exhausted the SDK's own
          // reconnect budget). Re-mint the token via /join; the
          // <LiveKitRoom> remount will pick up the new value.
          refreshToken().catch(() => {
            leaveSession()
            if (window.location.pathname.endsWith('/live')) {
              navigate(`/communication-reporting/virtual-classroom/${sessionId}`)
            }
          })
        }}
        style={{ width: '100%', height: '100%' }}
      >
        {/* G16/G17 — these data-channel listeners must be mounted at
            LiveKitRoom level rather than inside FullscreenClassroom so
            they keep running while the user is in docked or pip mode.
            Without this, switching to docked mid-class would silently
            drop hand-raise and breakout-invite messages. */}
        <HandRaiseSync />
        <BreakoutSync />
        <BreakoutHostHydrator />
        <BreakoutMoveListener />
        {mode === 'fullscreen' && <FullscreenClassroom />}
        {mode === 'docked' && <DockedClassroom />}
        {mode === 'pip' && (
          <PiPHost>
            <DockedClassroom />
          </PiPHost>
        )}
      </LiveKitRoom>
    </div>
  )
}
