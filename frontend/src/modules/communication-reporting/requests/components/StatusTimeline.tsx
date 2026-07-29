import type { StatusHistoryEntry } from '../requests-api'
import StatusBadge from './StatusBadge'

function formatDate(ts: string): string {
  const d = new Date(ts)
  return d.toLocaleString()
}

export default function StatusTimeline({ history }: { history: StatusHistoryEntry[] }) {
  if (history.length === 0) {
    return <p className="text-[12px] text-muted">No history yet.</p>
  }
  return (
    <ol className="flex flex-col gap-3">
      {history.map((h) => (
        <li
          key={h.id}
          className="flex flex-col gap-1 rounded-[10px] border px-3 py-2"
          style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}
        >
          <div className="flex items-center gap-2 flex-wrap">
            {h.from_status && (
              <>
                <StatusBadge status={h.from_status} />
                <span className="text-[11px] text-muted">→</span>
              </>
            )}
            <StatusBadge status={h.to_status} />
            {h.forwarded_to && (
              <span className="text-[11.5px] text-muted">
                forwarded to <span className="font-semibold">{h.forwarded_to.full_name}</span>
              </span>
            )}
            <span className="text-[11px] text-muted ms-auto">{formatDate(h.created_at)}</span>
          </div>
          <div className="flex items-center gap-2 text-[11.5px] text-muted">
            <span>by</span>
            <span className="font-semibold text-secondary">
              {h.actor ? h.actor.full_name : 'System'}
            </span>
          </div>
          {h.note && (
            <p className="text-[12.5px] text-secondary leading-snug whitespace-pre-line">{h.note}</p>
          )}
        </li>
      ))}
    </ol>
  )
}
