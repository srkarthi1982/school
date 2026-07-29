import { useNavigate } from 'react-router-dom'
import { HiOutlineChevronRight } from 'react-icons/hi2'

export interface Crumb {
  label: string
  // When set (and the crumb isn't the last one), the crumb renders as a link.
  to?: string
}

// Shared breadcrumb rendered at the top of every Course Builder / Course
// Selection category header. The last crumb is the current page (not a link).
export default function Breadcrumb({
  items,
  className = '',
}: {
  items: Crumb[]
  className?: string
}) {
  const navigate = useNavigate()
  return (
    <nav
      aria-label="Breadcrumb"
      className={`flex items-center flex-wrap gap-x-1.5 gap-y-1 ${className}`}
    >
      {items.map((item, i) => {
        const isLast = i === items.length - 1
        const clickable = !!item.to && !isLast
        return (
          <span key={i} className="inline-flex items-center gap-x-1.5 min-w-0">
            {clickable ? (
              <button
                type="button"
                onClick={() => navigate(item.to!)}
                className="text-[11px] font-semibold text-muted hover:text-accent bg-transparent border-none p-0 cursor-pointer transition-colors truncate max-w-[220px]"
              >
                {item.label}
              </button>
            ) : (
              <span
                className={`text-[11px] font-semibold truncate max-w-[240px] ${
                  isLast ? 'text-primary' : 'text-muted'
                }`}
              >
                {item.label}
              </span>
            )}
            {!isLast && <HiOutlineChevronRight className="text-[11px] text-muted shrink-0" />}
          </span>
        )
      })}
    </nav>
  )
}

// Build the standard three-level course category breadcrumb:
//   {scope} › {course title} › {category}
export function courseCategoryCrumbs(opts: {
  scopeLabel: string
  listPath: string
  courseTitle?: string | null
  detailPath: string
  categoryLabel: string
}): Crumb[] {
  return [
    { label: opts.scopeLabel, to: opts.listPath },
    { label: opts.courseTitle || 'Course', to: opts.detailPath },
    { label: opts.categoryLabel },
  ]
}
