import { useState, type ReactNode } from 'react'
import { HiOutlineChevronDown } from 'react-icons/hi2'

interface CardSectionProps {
  title: string
  subtitle?: string
  rightSlot?: ReactNode
  countBadge?: number | null
  collapsible?: boolean
  defaultOpen?: boolean
  bodyClassName?: string
  children: ReactNode
}

export default function CardSection({
  title,
  subtitle,
  rightSlot,
  countBadge,
  collapsible = false,
  defaultOpen = true,
  bodyClassName = '',
  children,
}: CardSectionProps) {
  const [open, setOpen] = useState(defaultOpen)

  const hasBadge = countBadge !== undefined && countBadge !== null
  const badge = (
    <span
      className={`inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-full text-[11px] font-semibold ${
        countBadge && countBadge > 0
          ? 'bg-accent-light text-accent'
          : 'bg-[var(--surface-2)] text-muted'
      }`}
    >
      {countBadge ?? 0}
    </span>
  )

  const header = (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 min-w-0">
        {collapsible && (
          <HiOutlineChevronDown
            className={`text-[14px] text-muted shrink-0 transition-transform ${
              open ? '' : '-rotate-90'
            }`}
          />
        )}
        <h3 className="text-[14px] font-semibold text-primary truncate">{title}</h3>
        {hasBadge && badge}
      </div>
      {rightSlot && <div className="flex items-center gap-2 shrink-0">{rightSlot}</div>}
    </div>
  )

  return (
    <section className="rounded-[12px] border border-[var(--border)] bg-[var(--surface)] p-4 flex flex-col gap-3">
      {collapsible ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-left bg-transparent border-none p-0 cursor-pointer"
          aria-expanded={open}
        >
          {header}
        </button>
      ) : (
        header
      )}

      {subtitle && open && (
        <p className="text-[12px] text-muted -mt-1">{subtitle}</p>
      )}

      {open && (
        <div className={`flex flex-col gap-3 ${bodyClassName}`}>{children}</div>
      )}
    </section>
  )
}
