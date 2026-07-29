import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'
import { useI18n } from '../../../infra/locales/I18nContext'
import useClassroomStore from './classroomStore'

// Thin route — the actual UI is rendered by <ClassroomMount /> at Layout
// level so the LiveKit connection survives navigation in P4. This component
// is responsible only for triggering join / setMode based on the URL.
export default function VirtualClassroomLivePage() {
  const { t } = useI18n()
  const { id } = useParams<{ id: string }>()
  const sessionId = Number(id)
  const navigate = useNavigate()

  const { active, isJoining, joinError, joinSession } = useClassroomStore(
    useShallow((s) => ({
      active: s.active,
      isJoining: s.isJoining,
      joinError: s.joinError,
      joinSession: s.joinSession,
    })),
  )

  useEffect(() => {
    if (!Number.isFinite(sessionId)) {
      navigate('/communication-reporting/virtual-classroom')
      return
    }
    if (!active || active.id !== sessionId) {
      joinSession(sessionId).then((next) => {
        if (!next) {
          navigate(`/communication-reporting/virtual-classroom/${sessionId}`)
        }
      })
    }
    // No cleanup. The session must persist when the user navigates away —
    // ClassroomMount auto-switches the visual mode to 'docked' so the video
    // keeps playing as a small floating panel. The user disconnects only
    // by clicking Leave inside the VideoConference / DockedClassroom UI.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  if (joinError) {
    return (
      <div className="card p-8 text-center text-sm">
        <div className="text-red-600 mb-3">{joinError}</div>
        <button
          className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-accent text-white border-none cursor-pointer"
          onClick={() => navigate(`/communication-reporting/virtual-classroom/${sessionId}`)}
        >
          {t('virtualClassroom.detail.backToList')}
        </button>
      </div>
    )
  }

  if (isJoining || !active) {
    return (
      <div className="card p-8 text-center text-muted text-sm">
        {t('common.loading')}
      </div>
    )
  }

  return null
}
