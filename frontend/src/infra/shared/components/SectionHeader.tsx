import type { ReactNode } from 'react'

interface Props {
  title: string
  /** Optional leading icon shown before the title. */
  icon?: ReactNode
  /** Optional description line shown below the title. */
  description?: string
  /** Optional small uppercase label shown above the title (e.g. "Management"). */
  eyebrow?: string
  /** Optional right-aligned action area (e.g. a primary button). */
  actions?: ReactNode
  /** Hide the bottom divider (shown by default). */
  divider?: boolean
  /** Extra classes on the root — e.g. page-owned bottom spacing (`mb-4`). */
  className?: string
}

/**
 * Shared page/section header — one consistent title block across all modules.
 *
 * Covers every header variant in the app: an optional uppercase `eyebrow`
 * label, a leading `icon`, a `description` line, and a right-aligned `actions`
 * slot (for a primary button). Pages must not hand-roll their own title markup.
 */
export default function SectionHeader({
  title,
  icon,
  description,
  eyebrow,
  actions,
  divider = true,
  className,
}: Props) {
  return (
    <div className={className}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          {eyebrow && (
            <p className="text-[11px] font-bold text-accent tracking-[0.09em] uppercase mb-1">
              {eyebrow}
            </p>
          )}
          <div className="flex items-center gap-2.5">
            {icon && <span className="text-[20px] text-accent shrink-0">{icon}</span>}
            <h2 className="text-[22px] font-bold text-primary tracking-[-0.02em] truncate">
              {title}
            </h2>
          </div>
          {description && <p className="text-[13px] text-muted mt-1">{description}</p>}
        </div>
        {actions && <div className="shrink-0 flex items-center gap-2">{actions}</div>}
      </div>
      {divider && <div className="h-px bg-[var(--border)] mt-4" />}
    </div>
  )
}
