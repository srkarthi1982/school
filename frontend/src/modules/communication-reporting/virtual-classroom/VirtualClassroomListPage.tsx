import { useEffect, useMemo, useState } from 'react'
import {
  HiOutlinePlus,
  HiOutlineVideoCamera,
  HiOutlineCalendarDays,
  HiOutlineUserGroup,
} from 'react-icons/hi2'
import { Link } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'
import { useI18n } from '../../../infra/locales/I18nContext'
import useAuthStore, { selectUserPermissions } from '../../../infra/auth/useAuthStore'
import { confirmDialog } from '../../../infra/shared/store/useConfirmStore'
import useToastStore from '../../../infra/shared/store/useToastStore'
import Paginator from '../../../infra/shared/components/Paginator'
import SectionHeader from '../../../infra/shared/components/SectionHeader'
import EmptyState from '../../../infra/shared/components/EmptyState'
import SessionFormModal from './components/SessionFormModal'
import StatusBadge from './components/StatusBadge'
import useVirtualClassroomStore from './store'
import { SESSION_STATUSES, type ClassSession, type ClassSessionStatus } from './types'

function formatRange(startIso: string, endIso: string): string {
  const start = new Date(startIso)
  const end = new Date(endIso)
  const sameDay = start.toDateString() === end.toDateString()
  const opts: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' }
  if (sameDay) {
    return `${start.toLocaleDateString()} ${start.toLocaleTimeString([], opts)} – ${end.toLocaleTimeString([], opts)}`
  }
  return `${start.toLocaleString([], opts)} – ${end.toLocaleString([], opts)}`
}

export default function VirtualClassroomListPage() {
  const { t } = useI18n()
  const perms = useAuthStore(selectUserPermissions)
  const canWrite = useMemo(
    () => perms.has('class_session:write') || perms.has('admin:full'),
    [perms],
  )
  const canHost = useMemo(
    () => perms.has('class_session:host') || perms.has('admin:full'),
    [perms],
  )

  const { items, pagination, loading, error, fetch, create, update, remove, start, end } =
    useVirtualClassroomStore(
      useShallow((s) => ({
        items: s.items,
        pagination: s.pagination,
        loading: s.loading,
        error: s.error,
        fetch: s.fetch,
        create: s.create,
        update: s.update,
        remove: s.remove,
        start: s.start,
        end: s.end,
      })),
    )

  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState<ClassSessionStatus | ''>('')
  const [editing, setEditing] = useState<ClassSession | null>(null)
  const [showModal, setShowModal] = useState(false)

  useEffect(() => {
    fetch(page, {
      sortBy: 'scheduled_start',
      sortOrder: 'desc',
      filters: statusFilter ? { status: statusFilter } : undefined,
    })
  }, [page, statusFilter, fetch])

  // Show at most 3 ended sessions — the most recent ones, since items are
  // sorted by scheduled_start desc. This cap applies both in the main
  // (unfiltered) list and when the ENDED status filter is active.
  const visibleItems = useMemo(() => {
    let endedShown = 0
    return items.filter((session) => {
      if (session.status !== 'ENDED') return true
      endedShown += 1
      return endedShown <= 3
    })
  }, [items])

  const openCreate = () => {
    setEditing(null)
    setShowModal(true)
  }

  const openEdit = (session: ClassSession) => {
    setEditing(session)
    setShowModal(true)
  }

  const handleSubmit = async (
    payload: Parameters<typeof create>[0],
    version?: number,
  ) => {
    if (editing && version !== undefined) {
      await update(editing.id, { ...payload, version })
    } else {
      await create(payload)
    }
  }

  const handleDelete = async (session: ClassSession) => {
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
      await remove(session.id)
    } catch (e: unknown) {
      useToastStore.getState().push({ variant: 'error', title: (e as Error).message })
    }
  }

  const handleStart = async (session: ClassSession) => {
    try {
      await start(session.id)
    } catch (e: unknown) {
      useToastStore.getState().push({ variant: 'error', title: (e as Error).message })
    }
  }

  const handleEnd = async (session: ClassSession) => {
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
      await end(session.id)
    } catch (e: unknown) {
      useToastStore.getState().push({ variant: 'error', title: (e as Error).message })
    }
  }

  return (
    <div className="flex flex-col h-full gap-3">
      {/* ── Header ── */}
      <SectionHeader
        icon={<HiOutlineVideoCamera />}
        eyebrow={t('common.management')}
        title={t('virtualClassroom.title')}
        description={t('virtualClassroom.description')}
        actions={
          canWrite && (
            <button
              onClick={openCreate}
              data-guide="virtual-classroom:create"
              className="inline-flex items-center gap-1.5 bg-accent text-white text-sm font-semibold py-[9px] px-4 rounded-[10px] hover:opacity-90 transition-opacity border-none cursor-pointer font-sans shrink-0"
            >
              <HiOutlinePlus className="text-[15px]" />
              {t('virtualClassroom.create')}
            </button>
          )
        }
      />

      {/* ── Filter row ── */}
      <div className="card px-4 py-3 flex flex-wrap items-center gap-2 mb-4">
        <span className="text-xs text-muted me-2">{t('common.status')}:</span>
        <button
          onClick={() => {
            setStatusFilter('')
            setPage(1)
          }}
          className={[
            'px-3 py-1 rounded-full text-xs font-semibold transition-colors border',
            statusFilter === ''
              ? 'bg-accent text-white border-accent'
              : 'bg-surface-2 text-secondary border-bd hover:bg-surface',
          ].join(' ')}
        >
          {t('virtualClassroom.filter.allStatus')}
        </button>
        {SESSION_STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => {
              setStatusFilter(s)
              setPage(1)
            }}
            className={[
              'px-3 py-1 rounded-full text-xs font-semibold transition-colors border',
              statusFilter === s
                ? 'bg-accent text-white border-accent'
                : 'bg-surface-2 text-secondary border-bd hover:bg-surface',
            ].join(' ')}
          >
            {t(`virtualClassroom.status.${s}` as const)}
          </button>
        ))}
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="card px-4 py-3 mb-4 text-sm text-red-600 border-red-200">{error}</div>
      )}

      {/* ── List as cards ── */}
      <div
        className={
          'grid gap-3 grid-cols-1 md:grid-cols-2 xl:grid-cols-3' +
          (!loading && visibleItems.length === 0 ? ' flex-1 min-h-0' : '')
        }
      >
        {visibleItems.map((session) => (
          <div key={session.id} className="card p-4 flex flex-col gap-3">
            <div className="flex items-start justify-between gap-2">
              <Link
                to={`/communication-reporting/virtual-classroom/${session.id}`}
                className="text-base font-semibold text-primary hover:text-accent transition-colors flex-1 min-w-0 truncate"
              >
                {session.title}
              </Link>
              <StatusBadge status={session.status} />
            </div>
            {session.description && (
              <p className="text-sm text-muted line-clamp-2">{session.description}</p>
            )}
            <div className="text-xs text-secondary">
              {formatRange(session.scheduled_start, session.scheduled_end)}
            </div>
            <div className="flex items-center gap-1.5 flex-wrap pt-2 border-t border-bd">
              {session.status === 'SCHEDULED' && canHost && (
                <button
                  onClick={() => handleStart(session)}
                  className="px-2.5 py-1 rounded-[7px] text-xs font-semibold bg-accent text-white hover:opacity-90 cursor-pointer border-none"
                >
                  {t('virtualClassroom.start')}
                </button>
              )}
              {session.status === 'LIVE' && (
                <Link
                  to={`/communication-reporting/virtual-classroom/${session.id}`}
                  className="px-2.5 py-1 rounded-[7px] text-xs font-semibold bg-red-500 text-white hover:opacity-90 cursor-pointer border-none no-underline"
                >
                  {t('virtualClassroom.openLive')}
                </Link>
              )}
              {session.status === 'LIVE' && canHost && (
                <button
                  onClick={() => handleEnd(session)}
                  className="px-2.5 py-1 rounded-[7px] text-xs font-semibold bg-surface-2 text-secondary border border-bd hover:bg-surface cursor-pointer"
                >
                  {t('virtualClassroom.end')}
                </button>
              )}
              {session.status === 'SCHEDULED' && canWrite && (
                <button
                  onClick={() => openEdit(session)}
                  className="px-2.5 py-1 rounded-[7px] text-xs font-semibold bg-surface-2 text-secondary border border-bd hover:bg-surface cursor-pointer"
                >
                  {t('common.edit')}
                </button>
              )}
              {(session.status === 'SCHEDULED' || session.status === 'CANCELLED') && canWrite && (
                <button
                  onClick={() => handleDelete(session)}
                  className="px-2.5 py-1 rounded-[7px] text-xs font-semibold bg-rose-50 text-rose-600 border border-rose-200 hover:bg-rose-100 cursor-pointer ms-auto"
                >
                  {t('common.delete')}
                </button>
              )}
            </div>
          </div>
        ))}
        {!loading && visibleItems.length === 0 && (
          <div className="col-span-full flex flex-col min-h-0">
            <EmptyState
              fill
              icon={<HiOutlineVideoCamera />}
              title={t('virtualClassroom.empty')}
              description={t('empty.virtualClassroom.description')}
              hints={[
                {
                  icon: <HiOutlineCalendarDays />,
                  title: t('empty.virtualClassroom.scheduleTitle'),
                  description: t('empty.virtualClassroom.scheduleDesc'),
                },
                {
                  icon: <HiOutlineVideoCamera />,
                  title: t('empty.virtualClassroom.goLiveTitle'),
                  description: t('empty.virtualClassroom.goLiveDesc'),
                },
                {
                  icon: <HiOutlineUserGroup />,
                  title: t('empty.virtualClassroom.teachTitle'),
                  description: t('empty.virtualClassroom.teachDesc'),
                },
              ]}
            />
          </div>
        )}
      </div>

      <Paginator page={page} totalPages={pagination.pages} onPageChange={setPage} />

      <SessionFormModal
        open={showModal}
        editing={editing}
        onClose={() => setShowModal(false)}
        onSubmit={handleSubmit}
      />
    </div>
  )
}
