import {useEffect, useMemo, useState} from 'react'
import {useShallow} from 'zustand/react/shallow'
import {
  HiOutlineInbox,
  HiOutlinePlus,
  HiOutlineCube,
  HiOutlineLifebuoy,
  HiOutlineWrenchScrewdriver,
  HiOutlineChatBubbleLeftRight,
  HiOutlineCheckCircle,
} from 'react-icons/hi2'
import useAuthStore, {selectUser, selectUserPermissions} from '../../../infra/auth/useAuthStore'
import {useI18n} from '../../../infra/locales/I18nContext'
import {useItSupportStore} from './store'
import type {TicketSummary} from './types'
import SectionHeader from '../../../infra/shared/components/SectionHeader'
import EmptyState from '../../../infra/shared/components/EmptyState'
import TicketStatusBadge from './components/TicketStatusBadge'
import NewTicketModal from './NewTicketModal'
import ItTicketDetailModal from './ItTicketDetailModal'
import {ticketCode} from './utils'

function relativeTime(ts: string): string {
  return new Date(ts).toLocaleString()
}

export default function ItSupportPage() {
  const {t} = useI18n()
  const user = useAuthStore(selectUser)
  const perms = useAuthStore(selectUserPermissions)
  const currentUserId = user?.id ?? 0

  const isApprover = perms.has('ticket:approve') || perms.has('admin:full')
  const isItStaff = perms.has('ticket:respond') || perms.has('admin:full')
  const canCreate = perms.has('ticket:create') || perms.has('admin:full')
  const canViewAll = perms.has('ticket:view_all') || perms.has('admin:full')

  const {tickets, loading, fetch} = useItSupportStore(
    useShallow((s) => ({tickets: s.tickets, loading: s.loading, fetch: s.fetch})),
  )

  const [q, setQ] = useState('')
  const [openNew, setOpenNew] = useState(false)
  const [detailId, setDetailId] = useState<number | null>(null)
  const [tab, setTab] = useState<'inbox' | 'allTickets'>('inbox')

  useEffect(() => {
    fetch(tab === 'allTickets' ? 'all' : 'inbox')
  }, [tab, fetch])

  const filteredItems = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return tickets
    return tickets.filter(
      (t) =>
        t.title.toLowerCase().includes(needle) ||
        ticketCode(t.id).toLowerCase().includes(needle),
    )
  }, [tickets, q])

  const subtitle = (ticket: TicketSummary): string => {
    if (isApprover) {
      return ticket.status === 'submitted'
        ? t('itSupport.subtitle.needsAction')
        : t('itSupport.subtitle.awaitingResponse')
    }
    if (ticket.assigned_to?.id === currentUserId) return t('itSupport.subtitle.assignedToYou')
    if (!ticket.assigned_to && ticket.status === 'approved') return t('itSupport.subtitle.waitingClaim')
    return t('itSupport.subtitle.yourTicket')
  }

  return (
    <div className="flex flex-col gap-4 h-full min-h-0">
      <SectionHeader
        icon={<HiOutlineLifebuoy />}
        title={t('nav.communicationReport.itSupport.title')}
        actions={
          canCreate && (
            <button
              onClick={() => setOpenNew(true)}
              className="inline-flex items-center gap-1.5 bg-accent text-white text-sm font-semibold py-[9px] px-4 rounded-[10px] hover:opacity-90 transition-opacity border-none cursor-pointer"
            >
              <HiOutlinePlus className="text-[15px]" />
              {t('itSupport.newTicket')}
            </button>
          )
        }
      />

      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1 rounded-[10px] border p-1 bg-[var(--surface-2)]"
          style={{ borderColor: 'var(--border)' }}
        >
          <button
            onClick={() => setTab('inbox')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-[12.5px] font-semibold cursor-pointer border-none transition-colors ${tab === 'inbox' ? 'bg-[var(--surface)] text-[var(--accent)]' : 'text-[var(--text-muted)]'}`}
          >
            <HiOutlineInbox className="text-[14px]" />
            {t('itSupport.tabInbox')}
          </button>
          {canViewAll && (
            <button
              onClick={() => setTab('allTickets')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-[12.5px] font-semibold cursor-pointer border-none transition-colors ${tab === 'allTickets' ? 'bg-[var(--surface)] text-[var(--accent)]' : 'text-[var(--text-muted)]'}`}
            >
              <HiOutlineCube className="text-[14px]" />
              {t('itSupport.tabAll')}
            </button>
          )}
        </div>
      </div>

      <input
        type="text"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t('itSupport.searchPlaceholder')}
        className="rounded-[8px] border px-3 py-1.5 text-[12.5px] focus:outline-none focus:border-[var(--accent)]"
        style={{ borderColor: 'var(--border)' }}
      />

      <div
        className={'card p-0 overflow-hidden flex-1 flex flex-col min-h-0'}
      >
        {filteredItems.length === 0 ? (
          <EmptyState
            fill
            bare
            icon={<HiOutlineLifebuoy />}
            title={t('itSupport.noTickets')}
            description={t('empty.itSupport.description')}
            hints={[
              {
                icon: <HiOutlineWrenchScrewdriver />,
                title: t('empty.itSupport.reportTitle'),
                description: t('empty.itSupport.reportDesc'),
              },
              {
                icon: <HiOutlineChatBubbleLeftRight />,
                title: t('empty.itSupport.threadTitle'),
                description: t('empty.itSupport.threadDesc'),
              },
              {
                icon: <HiOutlineCheckCircle />,
                title: t('empty.itSupport.resolutionTitle'),
                description: t('empty.itSupport.resolutionDesc'),
              },
            ]}
          />
        ) : (
          <ul className="flex flex-col">
            {filteredItems.map((ticket, i) => (
              <li
                key={ticket.id}
                onClick={() => setDetailId(ticket.id)}
                className={`flex items-center gap-3 px-6 py-3.5 cursor-pointer hover:bg-[var(--surface-2)] ${i > 0 ? 'border-t border-[var(--border)]' : ''}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[11.5px] text-muted font-mono">{ticketCode(ticket.id)}</span>
                    <p className="text-[13.5px] font-semibold text-primary truncate">
                      {ticket.title}
                    </p>
                  </div>
                  <p className="text-[11.5px] text-muted truncate mt-0.5">
                    {subtitle(ticket)}
                    {' · '}{relativeTime(ticket.created_at)}
                  </p>
                </div>
                <TicketStatusBadge status={ticket.status} />
              </li>
            ))}
          </ul>
        )}
      </div>

      <NewTicketModal
        open={openNew}
        onClose={() => setOpenNew(false)}
        onCreated={() => setOpenNew(false)}
      />

      <ItTicketDetailModal
        open={detailId !== null}
        ticketId={detailId}
        currentUserId={currentUserId}
        isItStaff={isItStaff}
        isApprover={isApprover}
        onClose={() => setDetailId(null)}
      />
    </div>
  )
}
