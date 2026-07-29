import { useEffect, useMemo, useState } from 'react'
import { HiOutlineArrowLeft } from 'react-icons/hi2'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'
import { useI18n } from '../../../infra/locales/I18nContext'
import useAuthStore, { selectUserPermissions } from '../../../infra/auth/useAuthStore'
import { confirmDialog } from '../../../infra/shared/store/useConfirmStore'
import useToastStore from '../../../infra/shared/store/useToastStore'
import SectionHeader from '../../../infra/shared/components/SectionHeader'
import SessionFormModal from './components/SessionFormModal'
import StatusBadge from './components/StatusBadge'
import useVirtualClassroomStore from './store'
import type { CreateSessionPayload } from './types'

export default function VirtualClassroomDetailPage() {
  const { t } = useI18n()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const sessionId = Number(id)
  const perms = useAuthStore(selectUserPermissions)
  const canWrite = useMemo(
    () => perms.has('class_session:write') || perms.has('admin:full'),
    [perms],
  )
  const canHost = useMemo(
    () => perms.has('class_session:host') || perms.has('admin:full'),
    [perms],
  )
  const canJoin = useMemo(
    () => perms.has('class_session:join') || perms.has('admin:full'),
    [perms],
  )

  const { current, loading, error, fetchOne, update, remove, start, end } =
    useVirtualClassroomStore(
      useShallow((s) => ({
        current: s.current,
        loading: s.loading,
        error: s.error,
        fetchOne: s.fetchOne,
        update: s.update,
        remove: s.remove,
        start: s.start,
        end: s.end,
      })),
    )

  const [showModal, setShowModal] = useState(false)

  useEffect(() => {
    if (Number.isFinite(sessionId)) fetchOne(sessionId)
  }, [sessionId, fetchOne])

  const handleSubmit = async (payload: CreateSessionPayload, version?: number) => {
    if (version !== undefined) {
      await update(sessionId, { ...payload, version })
    }
  }

  const handleStart = async () => {
    try {
      await start(sessionId)
    } catch (e: unknown) {
      useToastStore.getState().push({ variant: 'error', title: (e as Error).message })
    }
  }

  const handleEnd = async () => {
    if (
      !(await confirmDialog({
        title: t('virtualClassroom.end'),
        message: t('virtualClassroom.confirmEnd'),
        confirmLabel: t('virtualClassroom.end'),
        tone: 'danger',
      }))
    )
      return
    try {
      await end(sessionId)
    } catch (e: unknown) {
      useToastStore.getState().push({ variant: 'error', title: (e as Error).message })
    }
  }

  const handleJoin = () => {
    navigate(`/communication-reporting/virtual-classroom/${sessionId}/live`)
  }

  if (!Number.isFinite(sessionId)) {
    return (
      <div className="card p-8 text-center text-muted">
        {t('virtualClassroom.notFound')}
      </div>
    )
  }

  if (loading && !current) {
    return <div className="card p-8 text-center text-muted">{t('common.loading')}</div>
  }

  if (error && !current) {
    return <div className="card p-8 text-center text-red-600 text-sm">{error}</div>
  }

  if (!current) {
    return (
      <div className="card p-8 text-center text-muted">
        {t('virtualClassroom.notFound')}
      </div>
    )
  }

  return (
    <div>
      {/* ── Header ── */}
      <Link
        to="/communication-reporting/virtual-classroom"
        className="inline-flex items-center gap-1 text-xs text-muted hover:text-accent mb-2 no-underline"
      >
        <HiOutlineArrowLeft className="text-[12px]" />
        {t('virtualClassroom.detail.backToList')}
      </Link>
      <SectionHeader
        className="mb-4"
        title={current.title}
        divider={false}
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge status={current.status} />
            <span className="text-xs text-muted">
              {t('virtualClassroom.fields.roomName')}: {current.livekit_room_name}
            </span>
          </div>
        }
      />

      {/* ── Action panel ── */}
      <div className="card px-4 py-3 mb-4 flex flex-wrap gap-2 items-center">
        {current.status === 'SCHEDULED' && canHost && (
          <button
            onClick={handleStart}
            className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-accent text-white hover:opacity-90 cursor-pointer border-none"
          >
            {t('virtualClassroom.start')}
          </button>
        )}
        {current.status === 'LIVE' && canJoin && (
          <button
            onClick={handleJoin}
            className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-red-500 text-white hover:opacity-90 cursor-pointer border-none"
          >
            {t('virtualClassroom.join')}
          </button>
        )}
        {current.status === 'LIVE' && canHost && (
          <button
            onClick={handleEnd}
            className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-surface-2 text-secondary border border-bd hover:bg-surface cursor-pointer"
          >
            {t('virtualClassroom.end')}
          </button>
        )}
        {current.status === 'SCHEDULED' && canWrite && (
          <button
            onClick={() => setShowModal(true)}
            className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-surface-2 text-secondary border border-bd hover:bg-surface cursor-pointer"
          >
            {t('common.edit')}
          </button>
        )}
        {(current.status === 'SCHEDULED' || current.status === 'CANCELLED') && canWrite && (
          <button
            onClick={async () => {
              if (
                !(await confirmDialog({
                  title: t('common.delete'),
                  message: t('virtualClassroom.confirmDelete'),
                  confirmLabel: t('common.delete'),
                  tone: 'danger',
                }))
              )
                return
              try {
                await remove(current.id)
                window.history.back()
              } catch (e: unknown) {
                useToastStore.getState().push({ variant: 'error', title: (e as Error).message })
              }
            }}
            className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-rose-50 text-rose-600 border border-rose-200 hover:bg-rose-100 cursor-pointer ms-auto"
          >
            {t('common.delete')}
          </button>
        )}
      </div>

      {/* ── Info panel ── */}
      <div className="card p-5 mb-6 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
        {current.description && (
          <div className="md:col-span-2">
            <div className="text-xs text-muted mb-1">
              {t('virtualClassroom.fields.description')}
            </div>
            <div className="text-primary whitespace-pre-line">{current.description}</div>
          </div>
        )}
        <div>
          <div className="text-xs text-muted mb-1">
            {t('virtualClassroom.fields.scheduledStart')}
          </div>
          <div className="text-primary">
            {new Date(current.scheduled_start).toLocaleString()}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted mb-1">
            {t('virtualClassroom.fields.scheduledEnd')}
          </div>
          <div className="text-primary">
            {new Date(current.scheduled_end).toLocaleString()}
          </div>
        </div>
        {current.actual_start && (
          <div>
            <div className="text-xs text-muted mb-1">
              {t('virtualClassroom.fields.actualStart')}
            </div>
            <div className="text-primary">
              {new Date(current.actual_start).toLocaleString()}
            </div>
          </div>
        )}
        {current.actual_end && (
          <div>
            <div className="text-xs text-muted mb-1">
              {t('virtualClassroom.fields.actualEnd')}
            </div>
            <div className="text-primary">
              {new Date(current.actual_end).toLocaleString()}
            </div>
          </div>
        )}
        <div className={"hidden"}>
          <div className="text-xs text-muted mb-1">
            {t('virtualClassroom.fields.maxParticipants')}
          </div>
          <div className="text-primary">{current.max_participants}</div>
        </div>
        <div>
          <div className="text-xs text-muted mb-1">{t('virtualClassroom.fields.host')}</div>
          <div className="text-primary">#{current.host_user_id}</div>
        </div>
      </div>

      <SessionFormModal
        open={showModal}
        editing={current}
        onClose={() => setShowModal(false)}
        onSubmit={handleSubmit}
      />
    </div>
  )
}
