import { useI18n } from '../../../../infra/locales/I18nContext'
import type { ItTicketStatus } from '../types'

const STATUS_COLORS: Record<ItTicketStatus, { bg: string; text: string }> = {
  submitted: { bg: 'rgba(59,130,246,0.10)', text: '#2563EB' },
  approved:  { bg: 'rgba(16,185,129,0.12)', text: '#059669' },
  declined:  { bg: 'rgba(220,38,38,0.10)',  text: '#DC2626' },
  viewed:    { bg: 'rgba(245,158,11,0.10)', text: '#D97706' },
  resolved:  { bg: 'rgba(99,102,241,0.12)', text: '#6366F1' },
}

export default function TicketStatusBadge({ status }: { status: ItTicketStatus }) {
  const { t } = useI18n()
  const s = STATUS_COLORS[status]
  const labels: Record<ItTicketStatus, string> = {
    submitted: t('itSupport.status.submitted'),
    approved: t('itSupport.status.approved'),
    declined: t('itSupport.status.declined'),
    viewed: t('itSupport.status.viewed'),
    resolved: t('itSupport.status.resolved'),
  }
  return (
    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold capitalize shrink-0" style={{ background: s.bg, color: s.text }}>
      {labels[status]}
    </span>
  )
}
