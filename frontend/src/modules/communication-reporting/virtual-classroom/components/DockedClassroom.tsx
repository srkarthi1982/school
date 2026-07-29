import {
  GridLayout,
  ParticipantTile,
  TrackToggle,
  useTracks,
} from '@livekit/components-react'
import { Track } from 'livekit-client'
import { useEffect, useState } from 'react'
import {
  HiOutlineArrowsPointingOut,
  HiOutlineArrowTopRightOnSquare,
  HiOutlineXMark,
} from 'react-icons/hi2'
import { useNavigate } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'
import { extractErrorMessage } from '../../../../infra/shared/utils/apiError'
import { useI18n } from '../../../../infra/locales/I18nContext'
import useClassroomStore from '../classroomStore'
import {
  getPipWindow,
  hasDocumentPipSupport,
  setPipWindow,
  syncStylesToPip,
} from './pipWindow'
import ScreenShareBanner from './ScreenShareBanner'

// Compact floating UI used when the active LiveKit session is docked
// (i.e. the user is not on the /live route). Shows the camera grid plus
// quick mic / camera mute, an "expand" button that navigates back to the
// live page, and a "leave" button that disconnects.
export default function DockedClassroom() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const { active, mode, setMode, leaveSession } = useClassroomStore(
    useShallow((s) => ({
      active: s.active,
      mode: s.mode,
      setMode: s.setMode,
      leaveSession: s.leaveSession,
    })),
  )

  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  )

  const pipSupported = hasDocumentPipSupport()
  const isPip = mode === 'pip'
  const [popOutError, setPopOutError] = useState<string | null>(null)

  // Auto-clear the error toast after a short delay so it doesn't linger
  // forever — the user has already seen "what went wrong" by then.
  useEffect(() => {
    if (!popOutError) return
    const handle = setTimeout(() => setPopOutError(null), 3500)
    return () => clearTimeout(handle)
  }, [popOutError])

  const handlePopOut = async () => {
    if (!pipSupported) {
      setPopOutError(t('virtualClassroom.live.popOutUnsupported'))
      return
    }
    // G13 — idempotent. If a PiP window is already open (e.g., from a
    // prior click that the user has since hidden), just bring the React
    // store back into pip mode rather than trying to open a second one
    // (which Chrome would reject anyway since the API only supports a
    // single window per origin).
    const existing = getPipWindow()
    if (existing && !existing.closed) {
      setMode('pip')
      return
    }
    try {
      // requestWindow must be the first await on user activation; awaiting
      // anything else first burns the activation token and Chrome rejects.
      // @ts-expect-error documentPictureInPicture is not in TS lib.dom yet
      const win: Window = await window.documentPictureInPicture.requestWindow({
        width: 420,
        height: 280,
        disallowReturnToOpener: false,
      })
      syncStylesToPip(win.document)
      setPipWindow(win)
      setMode('pip')
      setPopOutError(null)
      win.addEventListener('pagehide', () => {
        setPipWindow(null)
        // Only fall back to the in-app dock when the user was still in pip
        // mode at the moment the window closed. If something else (expand
        // button, leaveSession) already moved the mode to fullscreen /
        // hidden, that wins — we shouldn't yank it back to docked here.
        if (useClassroomStore.getState().mode === 'pip') {
          useClassroomStore.getState().setMode('docked')
        }
      })
    } catch (e) {
      // Permission denied or feature unavailable. Tell the user instead of
      // silently swallowing — pre-fix the button looked broken.
      setPopOutError(
        `${t('virtualClassroom.live.popOutFailed')}: ${extractErrorMessage(e)}`,
      )
    }
  }

  if (!active) return null

  return (
    <div className="flex flex-col w-full">
      <div className="bg-black aspect-video relative">
        <GridLayout tracks={tracks} style={{ height: '100%' }}>
          <ParticipantTile />
        </GridLayout>
        <ScreenShareBanner compact />
      </div>
      {popOutError && (
        <div className="px-2 py-1 bg-red-50 border-t border-red-200 text-[11px] text-red-600 truncate">
          {popOutError}
        </div>
      )}
      <div className="px-2 py-1.5 bg-surface flex items-center gap-1 border-t border-bd">
        <span className="text-xs font-semibold text-primary truncate flex-1 ps-1">
          {t('virtualClassroom.live.dockedLabel')}
        </span>
        <TrackToggle source={Track.Source.Microphone} className="lk-button !p-1.5" />
        <TrackToggle source={Track.Source.Camera} className="lk-button !p-1.5" />
        {pipSupported && !isPip && (
          <button
            type="button"
            onClick={handlePopOut}
            aria-label={t('virtualClassroom.live.popOut')}
            title={t('virtualClassroom.live.popOut')}
            className="p-1.5 rounded text-primary hover:bg-surface-2 cursor-pointer border-none bg-transparent"
          >
            <HiOutlineArrowTopRightOnSquare className="text-[15px]" />
          </button>
        )}
        <button
          type="button"
          onClick={() => navigate(`/communication-reporting/virtual-classroom/${active.id}/live`)}
          aria-label={t('virtualClassroom.live.expand')}
          title={t('virtualClassroom.live.expand')}
          className="p-1.5 rounded text-primary hover:bg-surface-2 cursor-pointer border-none bg-transparent"
        >
          <HiOutlineArrowsPointingOut className="text-[15px]" />
        </button>
        <button
          type="button"
          onClick={leaveSession}
          aria-label={t('virtualClassroom.live.leave')}
          title={t('virtualClassroom.live.leave')}
          className="p-1.5 rounded text-primary hover:bg-rose-50 hover:text-rose-600 cursor-pointer border-none bg-transparent"
        >
          <HiOutlineXMark className="text-[15px]" />
        </button>
      </div>
    </div>
  )
}
