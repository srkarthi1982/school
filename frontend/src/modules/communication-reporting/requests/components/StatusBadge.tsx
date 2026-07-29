import type { RequestStatus } from '../requests-api'

const STATUS_STYLES: Record<RequestStatus, { label: string; bg: string; text: string }> = {
  created:  { label: 'Created',  bg: 'rgba(59,130,246,0.10)',  text: '#2563EB' },
  viewed:   { label: 'Viewed',   bg: 'rgba(245,158,11,0.12)',  text: '#D97706' },
  returned: { label: 'Returned', bg: 'rgba(220,38,38,0.10)',   text: '#DC2626' },
  edited:   { label: 'Edited',   bg: 'rgba(168,85,247,0.10)',  text: '#7C3AED' },
  resolved: { label: 'Resolved', bg: 'rgba(16,185,129,0.12)',  text: '#059669' },
  approved: { label: 'Approved', bg: 'rgba(34,197,94,0.12)',   text: '#16A34A' },
  canceled: { label: 'Canceled', bg: 'var(--surface-2)',       text: 'var(--text-muted)' },
}

export default function StatusBadge({ status }: { status: RequestStatus }) {
  const s = STATUS_STYLES[status]
  return (
    <span
      className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold capitalize shrink-0"
      style={{ background: s.bg, color: s.text }}
    >
      {s.label}
    </span>
  )
}
