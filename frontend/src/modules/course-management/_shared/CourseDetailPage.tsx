import {ReactNode, useEffect, useState} from 'react'
import {useNavigate} from 'react-router-dom'
import {HiOutlineArrowLeft, HiOutlineChevronRight, HiOutlineLockClosed} from 'react-icons/hi2'
import type {CategoryDef, CategorySlug, CourseEntity} from './types'
import {CATEGORIES, completionOf} from './types'
import ModifiedBadge from './ModifiedBadge'

interface Props {
  record: CourseEntity | null
  loading: boolean
  error: string | null
  // Lifecycle: parent loads the record by id.
  onMount: () => void
  // Navigate back to the parent list.
  listPath: string
  // Page label ("Course Builder" vs "Courses").
  scopeLabel: string
  // Detail base path (e.g. "/course-management/course-builder/123") — appended
  // with `/category/${slug}` for navigation.
  detailPath: string
  // Optional extras the parent can slot in below the header (e.g. Course
  // instance fields like dates/location).
  headerExtras?: ReactNode
  // Category set rendered as the gated stack (defaults to the master's).
  categories?: CategoryDef[]
  // Optional: returns true when a category's content differs from the master it
  // was seeded from (Course Selection instances only). Renders a "Modified" badge.
  modifiedFor?: (slug: CategorySlug) => boolean
}

export default function CourseDetailPage({
  record,
  loading,
  error,
  onMount,
  listPath,
  scopeLabel,
  detailPath,
  headerExtras,
  categories = CATEGORIES,
  modifiedFor,
}: Props) {
  const navigate = useNavigate()

  useEffect(() => {
    onMount()
  }, [onMount])

  if (loading && !record) {
    return <div className="p-6 text-sm text-muted">Loading…</div>
  }
  if (error && !record) {
    return <div className="p-6 text-sm text-red-500">{error}</div>
  }
  if (!record) {
    return <div className="p-6 text-sm text-muted">Not found.</div>
  }

  return (
    <div >
      <button
        onClick={() => navigate(listPath)}
        className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-muted hover:text-primary mb-4 bg-transparent border-none cursor-pointer p-0"
      >
        <HiOutlineArrowLeft className="text-[14px]" />
        Back to {scopeLabel}
      </button>

      <div className="mb-6">
        <p className="text-[11px] font-bold text-accent tracking-[0.08em] uppercase mb-1">{scopeLabel}</p>
        <h2 className="text-[22px] font-bold text-primary tracking-[-0.02em]">{record.title}</h2>
        <p className="text-[13px] text-secondary mt-1">
          {record.course_date ? `Course Date: ${record.course_date}` : 'No course date set'}
        </p>
        {headerExtras}
      </div>

      {/* 5-category stack */}
      <div className="flex flex-col gap-2 max-w-3xl">
        {categories.map((cat, idx) => {
          const completion = completionOf(record, cat.completionKey)
          const prevDone =
            idx === 0 ? true : completionOf(record, categories[idx - 1].completionKey) >= 100

          const disabled = !prevDone

          return (
            <CategoryRow
              key={cat.slug}
              index={idx + 1}
              label={cat.label}
              percent={completion}
              disabled={disabled}
              modified={modifiedFor?.(cat.slug) ?? false}
              delayMs={80 + idx * 120}
              onClick={() => {
                if (disabled) {
                  return
                }
                navigate(`${detailPath}/category/${cat.slug}`)
              }}
            />
          )
        })}
      </div>
    </div>
  )
}

function CategoryRow({
  index,
  label,
  percent,
  disabled,
  modified,
  onClick,
  delayMs,
}: {
  index: number
  label: string
  percent: number
  disabled: boolean
  modified: boolean
  onClick: () => void
  delayMs: number
}) {
  // Animate from 0% to the actual value on first mount: keep `fillPct` at 0
  // until after layout, then trigger the CSS transition by setting it.
  const [fillPct, setFillPct] = useState(0)
  useEffect(() => {
    const id = window.setTimeout(() => setFillPct(percent), delayMs)
    return () => window.clearTimeout(id)
  }, [percent, delayMs])

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={
        'relative overflow-hidden flex items-center gap-4 w-full p-4 rounded-xl border text-left transition-colors cursor-pointer font-sans ' +
        (disabled
          ? 'bg-surface-2 border-bd text-muted cursor-not-allowed opacity-60'
          : 'bg-surface border-bd hover:bg-surface-2')
      }
    >
      {/* Background progress fill — width animates on mount. Gradient fades
          out at the trailing edge so the boundary doesn't look like a wall. */}
      {!disabled && (
        <div
          aria-hidden
          className="absolute inset-y-0 left-0 pointer-events-none transition-[width] ease-out"
          style={{
            width: `${fillPct}%`,
            transitionDuration: '900ms',
            background:
              'linear-gradient(90deg, rgba(6,85,92,0.22) 0%, rgba(6,85,92,0.14) 60%, rgba(6,85,92,0) 100%)',
          }}
        />
      )}

      <span
        className="relative inline-flex items-center justify-center w-7 h-7 rounded-full text-[12px] font-bold shrink-0"
        style={{background: 'rgba(6,85,92,0.10)', color: 'var(--accent)'}}
      >
        {index}
      </span>
      <span className="relative flex-1 inline-flex items-center gap-2 text-[14px] font-bold text-primary">
        {label}
        {modified && <ModifiedBadge />}
      </span>

      <span className="relative text-[12px] font-bold text-accent shrink-0 tabular-nums w-10 text-right">
        {percent}%
      </span>

      {disabled ? (
        <HiOutlineLockClosed className="relative text-muted text-[16px]" />
      ) : (
        <HiOutlineChevronRight className="relative text-muted text-[16px]" />
      )}
    </button>
  )
}

export type {CategorySlug}
