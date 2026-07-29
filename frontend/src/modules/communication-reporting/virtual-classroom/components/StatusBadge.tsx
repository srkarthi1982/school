import { useI18n } from '../../../../infra/locales/I18nContext'
import type { ClassSessionStatus } from '../types'

const COLORS: Record<ClassSessionStatus, { bg: string; text: string; dot?: string }> = {
  SCHEDULED: { bg: 'rgba(234, 179, 8, 0.12)', text: '#A16207' },
  LIVE:      { bg: 'rgba(220, 38, 38, 0.12)', text: '#DC2626', dot: '#DC2626' },
  ENDED:     { bg: 'rgba(107, 114, 128, 0.12)', text: '#6B7280' },
  CANCELLED: { bg: 'rgba(244, 63, 94, 0.12)', text: '#E11D48' },
}

export default function StatusBadge({ status }: { status: ClassSessionStatus }) {
  const { t } = useI18n()
  const c = COLORS[status]
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold"
      style={{ background: c.bg, color: c.text }}
    >
      {c.dot && (
        <span
          className="w-1.5 h-1.5 rounded-full animate-pulse"
          style={{ background: c.dot }}
        />
      )}
      {t(`virtualClassroom.status.${status}` as const)}
    </span>
  )
}
