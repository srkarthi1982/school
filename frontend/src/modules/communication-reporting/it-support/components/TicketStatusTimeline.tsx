import { useI18n } from '../../../../infra/locales/I18nContext'
import type { TicketHistoryEntry } from '../types'
import TicketStatusBadge from './TicketStatusBadge'

function fmt(ts: string): string {
  return new Date(ts).toLocaleDateString() + ' ' + new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export default function TicketStatusTimeline({ history }: { history: TicketHistoryEntry[] }) {
  const { t } = useI18n()
  if (history.length === 0) {
    return <p className="text-[12px] text-muted">{t('itSupport.timeline.empty')}</p>
  }
  return (
    <ol className="flex flex-col gap-3">
      {history.map((h) => (
        <li key={h.id} className="flex flex-col gap-1 rounded-[10px] border px-3 py-2" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
          <div className="flex items-center gap-2 flex-wrap">
            {h.from_status && (
              <>
                <TicketStatusBadge status={h.from_status} />
                <span className="text-[11px] text-muted">{'→'}</span>
              </>
            )}
            <TicketStatusBadge status={h.to_status} />
            {h.forwarded_to && (
              <span className="text-[11px] text-muted">
                {t('itSupport.timeline.forwardedTo')} <span className="font-semibold">{h.forwarded_to.full_name}</span>
              </span>
            )}
            <span className="text-[10.5px] text-muted ms-auto">{fmt(h.created_at)}</span>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-muted">
            {t('itSupport.timeline.by')} <span className="font-semibold text-secondary">{h.actor ? h.actor.full_name : t('itSupport.timeline.system')}</span>
          </div>
          {h.note && <p className="text-[12px] text-secondary leading-snug whitespace-pre-line">{h.note}</p>}
        </li>
      ))}
    </ol>
  )
}
