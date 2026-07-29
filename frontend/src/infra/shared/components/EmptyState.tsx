import type { ReactNode } from 'react'

interface Hint {
  icon: ReactNode
  title: string
  description: string
}

interface Props {
  /** Headline — the primary "nothing here" message. */
  title: string
  /** Supporting line — explain what this page/section is for. */
  description?: string
  /** Leading icon, shown inside an accent-tinted badge. */
  icon?: ReactNode
  /** Optional call-to-action (e.g. a primary button) shown below the text. */
  action?: ReactNode
  /**
   * Optional "what you can do here" cards — each an icon + title + description.
   * Use them to fill an otherwise-empty page and explain its purpose.
   */
  hints?: Hint[]
  /**
   * Render without the surrounding `.card` wrapper — use when the empty state
   * sits inside a panel that already provides the card chrome.
   */
  bare?: boolean
  /**
   * Stretch to fill the available page height (centers vertically). Use for
   * full-page empty states so the screen never shows a small box with a large
   * blank area beneath it.
   */
  fill?: boolean
  /** Smaller padding + icon, for empty states inside compact panels/cards. */
  compact?: boolean
}

/**
 * Shared empty-state block — one consistent, icon-forward "no data yet"
 * presentation across the app. With `fill` it grows to occupy the page so
 * sparse screens never look half-empty; with `hints` it doubles as a short
 * explainer of what the screen is for.
 */
export default function EmptyState({
  title,
  description,
  icon,
  action,
  hints,
  bare,
  fill,
  compact,
}: Props) {
  const body = (
    <div
      className={
        'flex flex-col items-center justify-center text-center ' +
        (compact ? 'px-4 py-6 ' : 'px-6 py-12 ') +
        (fill ? 'min-h-[60vh] h-full' : '')
      }
    >
      <span
        className={
          'rounded-2xl flex items-center justify-center shrink-0 ' +
          (compact ? 'w-11 h-11 text-[20px] mb-2' : 'w-16 h-16 text-[30px] mb-4')
        }
        style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}
      >
        {icon ?? '✦'}
      </span>
      <p className={(compact ? 'text-[13px]' : 'text-[16px]') + ' font-semibold text-primary'}>{title}</p>
      {description && (
        <p className="text-[13.5px] text-muted max-w-md leading-relaxed mt-1.5">
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}

      {hints && hints.length > 0 && (
        <div
          className="grid gap-3 mt-8 w-full max-w-2xl text-start"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}
        >
          {hints.map((h, i) => (
            <div key={i} className="card px-4 py-3.5 flex items-start gap-3">
              <span
                className="w-9 h-9 rounded-[10px] flex items-center justify-center text-[18px] shrink-0"
                style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}
              >
                {h.icon}
              </span>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-primary">{h.title}</p>
                <p className="text-[12px] text-muted leading-relaxed mt-0.5">{h.description}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
  return bare ? body : <div className="card h-full">{body}</div>
}
