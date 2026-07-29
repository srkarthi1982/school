import { useTracks } from '@livekit/components-react'
import { Track } from 'livekit-client'
import { HiOutlineComputerDesktop } from 'react-icons/hi2'
import { useI18n } from '../../../../infra/locales/I18nContext'

// E2 — small overlay that appears whenever any participant publishes a
// screen-share track, naming who is sharing. Renders nothing when no
// share is active. Drop it inside a positioned wrapper (the prebuilt
// VideoConference in fullscreen mode, or the docked video grid).
export default function ScreenShareBanner({ compact = false }: { compact?: boolean }) {
  const { t } = useI18n()
  const tracks = useTracks([
    { source: Track.Source.ScreenShare, withPlaceholder: false },
  ])
  if (tracks.length === 0) return null
  // Multiple simultaneous shares are rare; show the first publisher.
  const participant = tracks[0].participant
  const label = participant.name || participant.identity || ''
  const cls = compact
    ? 'absolute top-1.5 start-1.5 z-10 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-accent text-white shadow'
    : 'absolute top-3 start-3 z-30 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-accent text-white shadow-elevated'
  return (
    <div className={cls}>
      <HiOutlineComputerDesktop className={compact ? 'text-[11px]' : 'text-[13px]'} />
      <span>
        {t('virtualClassroom.live.sharing')}: {label}
      </span>
    </div>
  )
}
