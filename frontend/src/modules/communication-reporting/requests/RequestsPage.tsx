import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  HiOutlineInbox,
  HiOutlinePaperAirplane,
  HiOutlineUserGroup,
  HiOutlinePlus,
  HiOutlineCog6Tooth,
  HiOutlineBellAlert,
  HiOutlineInboxArrowDown,
  HiOutlineChatBubbleLeftRight,
  HiOutlineClock,
} from 'react-icons/hi2'
import useAuthStore, { selectUser } from '../../../infra/auth/useAuthStore'
import { useI18n } from '../../../infra/locales/I18nContext'
import SectionHeader from '../../../infra/shared/components/SectionHeader'
import EmptyState from '../../../infra/shared/components/EmptyState'
import {
  listRequests,
  listOverdueNotifications,
  markNotificationRead,
  type OverdueNotification,
  type RequestBox,
  type RequestSummary,
} from './requests-api'
import StatusBadge from './components/StatusBadge'
import NewRequestModal from './NewRequestModal'
import RequestDetailModal from './RequestDetailModal'
import RequestConfigSection from './RequestConfigSection'

type Tab = RequestBox | 'config' | 'notifications'

function relativeTime(ts: string): string {
  const d = new Date(ts)
  return d.toLocaleString()
}

export default function RequestsPage() {
  const { t } = useI18n()
  const user = useAuthStore(selectUser)
  const isAdmin = !!user?.roles?.includes('admin')
  const isTeacher = !!user?.roles?.includes('teacher')
  const isStudent = !!user?.roles?.includes('student') && !isAdmin && !isTeacher
  const userId = user?.id ?? -1

  const [tab, setTab] = useState<Tab>('inbox')
  const [items, setItems] = useState<RequestSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [openNew, setOpenNew] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [notifications, setNotifications] = useState<OverdueNotification[]>([])

  const refreshList = useCallback(async () => {
    if (tab === 'config' || tab === 'notifications') return
    setLoading(true)
    setError(null)
    try {
      const res = await listRequests({ box: tab })
      setItems(res.items)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [tab])

  const refreshNotifications = useCallback(async () => {
    if (!isAdmin) return
    try {
      const res = await listOverdueNotifications()
      setNotifications(res.items)
    } catch {
      /* ignore */
    }
  }, [isAdmin])

  useEffect(() => {
    refreshList()
  }, [refreshList])

  useEffect(() => {
    refreshNotifications()
  }, [refreshNotifications])

  const tabs = useMemo(() => {
    const list: { id: Tab; label: string; icon: React.ReactNode }[] = [
      { id: 'inbox', label: 'Inbox', icon: <HiOutlineInbox /> },
      { id: 'sent', label: 'Sent', icon: <HiOutlinePaperAirplane /> },
    ]
    if (isTeacher || isAdmin) {
      list.push({ id: 'unclaimed', label: 'Unclaimed', icon: <HiOutlineUserGroup /> })
    }
    if (isAdmin) {
      list.push({ id: 'notifications', label: 'Overdue', icon: <HiOutlineBellAlert /> })
      list.push({ id: 'config', label: 'Config', icon: <HiOutlineCog6Tooth /> })
    }
    return list
  }, [isTeacher, isAdmin])

  const unreadNotifications = notifications.filter((n) => n.read_at === null).length

  return (
    <div className="flex flex-col gap-4 h-full min-h-0">
      <SectionHeader
        icon={<HiOutlineInboxArrowDown />}
        title={t('nav.communicationReport.requests.title')}
        actions={
          <button
            onClick={() => setOpenNew(true)}
            data-guide="requests:new"
            className="inline-flex items-center gap-1.5 bg-accent text-white text-sm font-semibold py-[9px] px-4 rounded-[10px] hover:opacity-90 transition-opacity border-none cursor-pointer"
          >
            <HiOutlinePlus className="text-[15px]" />
            New Personal Request
          </button>
        }
      />

      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1 rounded-[10px] border p-1 bg-[var(--surface-2)]"
          style={{ borderColor: 'var(--border)' }}
        >
          {tabs.map((tabItem) => (
            <button
              key={tabItem.id}
              onClick={() => setTab(tabItem.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-[12.5px] font-semibold cursor-pointer border-none transition-colors"
              style={{
                background: tab === tabItem.id ? 'var(--surface)' : 'transparent',
                color: tab === tabItem.id ? 'var(--accent)' : 'var(--text-muted)',
              }}
            >
              <span className="text-[14px]">{tabItem.icon}</span>
              {tabItem.label}
              {tabItem.id === 'notifications' && unreadNotifications > 0 && (
                <span
                  className="ms-1 px-1.5 rounded-full text-[10px] font-bold text-white"
                  style={{ background: 'var(--danger)' }}
                >
                  {unreadNotifications}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {tab === 'config' && <RequestConfigSection />}

      {tab === 'notifications' && (
        <div className="card p-0 overflow-hidden">
          {notifications.length === 0 ? (
            <EmptyState title={t('empty.requests.overdueTitle')} bare />
          ) : (
            <ul className="flex flex-col">
              {notifications.map((n, i) => (
                <li
                  key={n.id}
                  className={`flex items-center gap-3 px-6 py-3.5 cursor-pointer hover:bg-[var(--surface-2)] ${i > 0 ? 'border-t border-[var(--border)]' : ''}`}
                  onClick={async () => {
                    if (n.read_at === null) {
                      try {
                        await markNotificationRead(n.id)
                        refreshNotifications()
                      } catch {
                        /* ignore */
                      }
                    }
                    setDetailId(n.request_id)
                  }}
                  style={{ background: n.read_at === null ? 'var(--danger-light)' : undefined }}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-primary truncate">
                      {n.request_purpose || 'Overdue request'}
                    </p>
                    <p className="text-[11.5px] text-muted">
                      flagged {relativeTime(n.created_at)}
                    </p>
                  </div>
                  <StatusBadge status={n.request_status} />
                  {n.read_at === null && (
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--danger)' }} />
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {(tab === 'inbox' || tab === 'sent' || tab === 'unclaimed') && (
        <div
          className={'card p-0 overflow-hidden flex-1 flex flex-col min-h-0'}
        >
          { error ? (
            <p className="px-6 py-6 text-[12.5px] text-red-600">{error}</p>
          ) : items.length === 0 ? (
            <EmptyState
              fill
              bare
              icon={<HiOutlineInboxArrowDown />}
              title={t('empty.requests.title')}
              description={t('empty.requests.description')}
              hints={[
                {
                  icon: <HiOutlinePaperAirplane />,
                  title: t('empty.requests.sendTitle'),
                  description: t('empty.requests.sendDesc'),
                },
                {
                  icon: <HiOutlineChatBubbleLeftRight />,
                  title: t('empty.requests.trackTitle'),
                  description: t('empty.requests.trackDesc'),
                },
                {
                  icon: <HiOutlineClock />,
                  title: t('empty.requests.onTimeTitle'),
                  description: t('empty.requests.onTimeDesc'),
                },
              ]}
            />
          ) : (
            <ul className="flex flex-col">
              {items.map((r, i) => {
                const otherUser =
                  tab === 'sent' ? r.current_recipient : r.created_by
                const otherLabel =
                  otherUser?.full_name ??
                  (r.recipient_pool ? `Pool: ${r.recipient_pool}` : '—')
                return (
                  <li
                    key={r.id}
                    onClick={() => setDetailId(r.id)}
                    className={`flex items-center gap-3 px-6 py-3.5 cursor-pointer hover:bg-[var(--surface-2)] ${i > 0 ? 'border-t border-[var(--border)]' : ''}`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-[13.5px] font-semibold text-primary truncate">
                        {r.purpose}
                      </p>
                      <p className="text-[11.5px] text-muted truncate">
                        {tab === 'sent' ? 'to ' : 'from '}
                        {otherLabel} · {relativeTime(r.updated_at)}
                      </p>
                    </div>
                    <StatusBadge status={r.status} />
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}

      <NewRequestModal
        open={openNew}
        isStudent={isStudent}
        onClose={() => setOpenNew(false)}
        onCreated={() => {
          setOpenNew(false)
          refreshList()
        }}
      />

      <RequestDetailModal
        open={detailId !== null}
        requestId={detailId}
        currentUserId={userId}
        isAdmin={isAdmin}
        isTeacher={isTeacher}
        onClose={() => setDetailId(null)}
        onChanged={() => {
          refreshList()
          refreshNotifications()
        }}
      />
    </div>
  )
}
