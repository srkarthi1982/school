import { useEffect, useState } from 'react'
import { HiOutlineXMark } from 'react-icons/hi2'
import { useI18n } from '../../../infra/locales/I18nContext'
import TicketStatusBadge from './components/TicketStatusBadge'
import TicketStatusTimeline from './components/TicketStatusTimeline'
import UserPicker from './components/UserPicker'
import { useItSupportStore } from './store'
import { ticketCode } from './utils'
import type { TicketDetail, User } from './types'

interface Props {
  open: boolean
  ticketId: number | null
  currentUserId: number
  isItStaff: boolean
  isApprover: boolean
  onClose: () => void
}

export default function ItTicketDetailModal({
  open, ticketId, currentUserId, isItStaff, isApprover, onClose,
}: Props) {
  const { t } = useI18n()
  const loadTicket = useItSupportStore((s) => s.loadTicket)
  const approveTicket = useItSupportStore((s) => s.approveTicket)
  const declineTicket = useItSupportStore((s) => s.declineTicket)
  const claimTicket = useItSupportStore((s) => s.claimTicket)
  const resolveTicket = useItSupportStore((s) => s.resolveTicket)
  const cancelTicket = useItSupportStore((s) => s.cancelTicket)
  const forwardTicket = useItSupportStore((s) => s.forwardTicket)

  const [ticket, setTicket] = useState<TicketDetail | null>(null)
  const [mode, setMode] = useState<'approve' | 'resolve' | 'decline' | 'forward' | null>(null)
  const [note, setNote] = useState('')
  const [forwardTo, setForwardTo] = useState<User | null>(null)
  const [approveAssignee, setApproveAssignee] = useState<User | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || ticketId === null) {
      setTicket(null)
      setMode(null)
      setNote('')
      setForwardTo(null)
      setApproveAssignee(null)
      setError(null)
      return
    }
    let cancelled = false
    setError(null)
    loadTicket(ticketId)
      .then((data) => { if (!cancelled) setTicket(data) })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)) })
    return () => { cancelled = true }
  }, [open, ticketId, loadTicket])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  const isCreator = !!ticket && ticket.created_by?.id === currentUserId
  const isAssigned = !!ticket && ticket.assigned_to?.id === currentUserId
  const isTerminal = !!ticket && ['resolved', 'declined'].includes(ticket.status)

  const canApprove = isApprover && ticket?.status === 'submitted'
  const canDecline = isApprover && ticket?.status === 'submitted'
  const canClaim = isItStaff && !isAssigned && ticket?.status === 'approved' && !ticket?.assigned_to
  const canCancel = isCreator && !isTerminal
  const canResolve = isItStaff && isAssigned && !isTerminal
  const canForward = isItStaff && isAssigned && !isTerminal

  async function run(action: () => Promise<TicketDetail>) {
    setBusy(true)
    setError(null)
    try {
      const updated = await action()
      setTicket(updated)
      setMode(null)
      setNote('')
      setForwardTo(null)
      setApproveAssignee(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const handleApprove = () => { if (ticket) run(() => approveTicket(ticket.id, approveAssignee?.id ?? null)) }
  const handleDecline = () => { if (ticket && note.trim()) run(() => declineTicket(ticket.id, note.trim())) }
  const handleClaim = () => { if (ticket) run(() => claimTicket(ticket.id)) }
  const handleResolve = () => { if (ticket && note.trim()) run(() => resolveTicket(ticket.id, note.trim())) }
  const handleForward = () => { if (ticket && forwardTo) run(() => forwardTicket(ticket.id, forwardTo.id)) }
  const handleCancel = () => { if (ticket) run(() => cancelTicket(ticket.id)) }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-2xl rounded-2xl border bg-[var(--surface)] shadow-md flex flex-col max-h-[85vh]" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-3 px-5 py-3 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
          <h3 className="text-[15px] font-bold text-primary truncate flex-1">{ticket ? `${ticketCode(ticket.id)}: ${ticket.title}` : ''}</h3>
          {ticket && <TicketStatusBadge status={ticket.status} />}
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-[8px] flex items-center justify-center text-muted hover:bg-[var(--surface-2)] bg-transparent border-none cursor-pointer" aria-label={t('itSupport.close')}>
            <HiOutlineXMark className="text-[18px]" />
          </button>
        </div>

        <div className="px-5 py-4 overflow-y-auto thin-scrollbar-light flex flex-col gap-4">
          {error && <p className="text-[12px] text-red-600">{error}</p>}
          {ticket && (
            <>
              <div className="grid grid-cols-2 gap-3 text-[12px]">
                <div>
                  <p className="text-muted uppercase tracking-wider text-[10.5px] font-bold mb-0.5">{t('itSupport.detail.from')}</p>
                  <p className="text-primary font-semibold">{ticket.created_by?.full_name ?? '—'}</p>
                </div>
                <div>
                  <p className="text-muted uppercase tracking-wider text-[10.5px] font-bold mb-0.5">{t('itSupport.detail.assignedTo')}</p>
                  <p className="text-primary font-semibold">
                    {ticket.assigned_to ? ticket.assigned_to.full_name : ticket.status === 'submitted' ? t('itSupport.detail.itPool') : ticket.status === 'approved' ? t('itSupport.detail.waitingForIt') : '—'}
                  </p>
                </div>
              </div>

              <div>
                <p className="text-muted uppercase tracking-wider text-[10.5px] font-bold mb-1">{t('itSupport.detail.description')}</p>
                <p className="text-[13px] text-primary whitespace-pre-line leading-relaxed">{ticket.description}</p>
              </div>

              {ticket.decline_reason && ticket.status === 'declined' && (
                <div className="rounded-[10px] border border-red-300 bg-red-50 px-3 py-2">
                  <p className="text-[11.5px] font-bold text-red-700 mb-0.5 uppercase tracking-wider">{t('itSupport.detail.declined')}</p>
                  <p className="text-[12.5px] text-red-900 whitespace-pre-line">{ticket.decline_reason}</p>
                </div>
              )}

              {ticket.resolution_notes && (
                <div className="rounded-[10px] border px-3 py-2" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
                  <p className="text-[11.5px] font-bold text-secondary mb-0.5">{t('itSupport.detail.resolutionNotes')}</p>
                  <p className="text-[12.5px] text-secondary whitespace-pre-line">{ticket.resolution_notes}</p>
                </div>
              )}

              <div>
                <p className="text-muted uppercase tracking-wider text-[10.5px] font-bold mb-2">{t('itSupport.detail.history')}</p>
                <TicketStatusTimeline history={ticket.history ?? []} />
              </div>
            </>
          )}
        </div>

        {ticket && (
          <div className="flex items-center gap-2 px-5 py-3 border-t shrink-0 flex-wrap" style={{ borderColor: 'var(--border)' }}>
            {canApprove && (
              <button onClick={() => { setMode('approve'); setApproveAssignee(null); }} disabled={busy} className="px-3 py-1.5 rounded-[8px] text-[12px] font-semibold text-white cursor-pointer disabled:opacity-50" style={{ background: 'var(--success)' }}>
                {t('itSupport.action.approveAssign')}
              </button>
            )}
            {canDecline && (
              <button onClick={() => { setMode('decline'); setNote(''); }} disabled={busy} className="px-3 py-1.5 rounded-[8px] text-[12px] font-semibold text-[var(--danger)] border border-[var(--danger)] hover:bg-red-50 cursor-pointer bg-transparent">
                {t('itSupport.action.decline')}
              </button>
            )}
            {canClaim && (
              <button onClick={handleClaim} disabled={busy} className="px-3 py-1.5 rounded-[8px] text-[12px] font-semibold text-white cursor-pointer disabled:opacity-50" style={{ background: 'var(--accent)' }}>
                {t('itSupport.action.claim')}
              </button>
            )}
            {canResolve && (
              <button onClick={() => { setMode('resolve'); setNote(''); }} disabled={busy} className="px-3 py-1.5 rounded-[8px] text-[12px] font-semibold text-white cursor-pointer disabled:opacity-50" style={{ background: 'var(--success)' }}>
                {t('itSupport.action.resolve')}
              </button>
            )}
            {canForward && (
              <button onClick={() => { setMode('forward'); setForwardTo(null); }} disabled={busy} className="px-3 py-1.5 rounded-[8px] text-[12px] font-semibold text-secondary border border-[var(--bd)] hover:text-primary cursor-pointer bg-transparent">
                {t('itSupport.action.forward')}
              </button>
            )}
            {canCancel && (
              <button onClick={handleCancel} disabled={busy} className="px-3 py-1.5 rounded-[8px] text-[12px] font-semibold text-red-600 border border-[var(--bd)] hover:bg-red-50 cursor-pointer bg-transparent ms-auto">
                {t('itSupport.action.cancel')}
              </button>
            )}

            {mode === 'approve' && canApprove && (
              <div className="w-full flex flex-col gap-2">
                <p className="text-[11px] font-semibold text-muted">{t('itSupport.form.approveHint')}</p>
                <UserPicker value={approveAssignee} onChange={setApproveAssignee} placeholder={t('itSupport.form.assignPlaceholder')} />
                <button onClick={handleApprove} disabled={busy} className="px-3 py-1.5 rounded-[8px] text-[12px] font-semibold text-white cursor-pointer disabled:opacity-50 ms-auto" style={{ background: 'var(--success)' }}>
                  {t('itSupport.form.confirmApprove')}
                </button>
              </div>
            )}

            {mode === 'decline' && (
              <div className="w-full flex flex-col gap-2" style={{ borderColor: 'var(--border)' }}>
                <textarea
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={t('itSupport.form.declinePlaceholder')}
                  className="w-full rounded-[10px] border bg-[var(--surface-2)] px-3 py-2 text-[13px] focus:outline-none focus:border-[var(--accent)] resize-none"
                  style={{ borderColor: 'var(--border)' }}
                />
                <div className="flex gap-2">
                  <button onClick={() => { setMode(null); setNote(''); }} className="px-3 py-1.5 rounded-[8px] text-[12px] font-semibold text-secondary border border-[var(--bd)] hover:text-primary cursor-pointer bg-transparent">
                    {t('common.cancel')}
                  </button>
                  <button onClick={handleDecline} disabled={busy || !note.trim()} className="px-3 py-1.5 rounded-[8px] text-[12px] font-semibold text-white cursor-pointer disabled:opacity-50 ms-auto" style={{ background: 'var(--danger)' }}>
                    {t('itSupport.form.confirmDecline')}
                  </button>
                </div>
              </div>
            )}

            {mode === 'resolve' && (
              <div className="w-full flex flex-col gap-2" style={{ borderColor: 'var(--border)' }}>
                <textarea
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={t('itSupport.form.resolvePlaceholder')}
                  className="w-full rounded-[10px] border bg-[var(--surface-2)] px-3 py-2 text-[13px] focus:outline-none focus:border-[var(--accent)] resize-none"
                  style={{ borderColor: 'var(--border)' }}
                />
                <div className="flex gap-2">
                  <button onClick={() => { setMode(null); setNote(''); }} className="px-3 py-1.5 rounded-[8px] text-[12px] font-semibold text-secondary border border-[var(--bd)] hover:text-primary cursor-pointer bg-transparent">
                    {t('common.cancel')}
                  </button>
                  <button onClick={handleResolve} disabled={busy || !note.trim()} className="px-3 py-1.5 rounded-[8px] text-[12px] font-semibold text-white cursor-pointer disabled:opacity-50 ms-auto" style={{ background: 'var(--success)' }}>
                    {t('itSupport.form.confirmResolve')}
                  </button>
                </div>
              </div>
            )}

            {mode === 'forward' && (
              <div className="w-full flex flex-col gap-2" style={{ borderColor: 'var(--border)' }}>
                <UserPicker value={forwardTo} onChange={setForwardTo} placeholder={t('itSupport.form.forwardPlaceholder')} />
                <div className="flex gap-2">
                  <button onClick={() => { setMode(null); setForwardTo(null); }} className="px-3 py-1.5 rounded-[8px] text-[12px] font-semibold text-secondary border border-[var(--bd)] hover:text-primary cursor-pointer bg-transparent">
                    {t('common.cancel')}
                  </button>
                  <button onClick={handleForward} disabled={busy || !forwardTo} className="px-3 py-1.5 rounded-[8px] text-[12px] font-semibold text-white cursor-pointer disabled:opacity-50 ms-auto" style={{ background: 'var(--accent)' }}>
                    {t('itSupport.form.confirmForward')}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
