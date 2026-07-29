import {HiOutlineExclamationCircle} from 'react-icons/hi2'

interface Props {
  // When true, render a bare dot (for dense table rows) instead of a full pill.
  compact?: boolean
  // Tooltip / accessible label override.
  title?: string
}

const AMBER = '#D97706'
const AMBER_BG = 'rgba(245,158,11,0.12)'

/**
 * Small amber indicator shown when a Course Selection instance's content
 * (material / form / evaluation) differs from the master it was seeded from.
 */
export default function ModifiedBadge({compact = false, title = 'Modified from master'}: Props) {
  if (compact) {
    return (
      <span
        title={title}
        aria-label={title}
        className="inline-block w-2 h-2 rounded-full shrink-0"
        style={{background: AMBER}}
      />
    )
  }
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9.5px] font-bold tracking-[0.06em] uppercase shrink-0"
      style={{background: AMBER_BG, color: AMBER}}
    >
      <HiOutlineExclamationCircle className="text-[11px]" />
      Modified
    </span>
  )
}
