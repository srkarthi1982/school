import {useState, type FormEvent} from 'react'
import {useI18n} from '../../locales/I18nContext'

export const DEFAULT_PAGE_SIZE: number = 10

// Number of sibling pages to show on each side of the current page.
const SIBLINGS = 1
// Below this total, render every page number (no ellipsis needed).
const WINDOW_THRESHOLD = 7

type PageItem = number | 'ellipsis-left' | 'ellipsis-right'

// Build the windowed list of page items for a 0-based current page.
// e.g. current=5, total=500 -> [0, 'ellipsis-left', 4, 5, 6, 'ellipsis-right', 499]
export function getPageItems(current: number, total: number): PageItem[] {
    if (total <= WINDOW_THRESHOLD) {
        return Array.from({length: total}, (_, i) => i)
    }

    const first = 0
    const last = total - 1
    const start = Math.max(first + 1, current - SIBLINGS)
    const end = Math.min(last - 1, current + SIBLINGS)

    const items: PageItem[] = [first]

    // Left gap: use an ellipsis only when it hides more than one page;
    // otherwise render the single hidden page number directly.
    if (start > first + 2) {
        items.push('ellipsis-left')
    } else if (start === first + 2) {
        items.push(first + 1)
    }

    for (let p = start; p <= end; p++) items.push(p)

    // Right gap: same collapse rule as the left side.
    if (end < last - 2) {
        items.push('ellipsis-right')
    } else if (end === last - 2) {
        items.push(last - 1)
    }

    items.push(last)
    return items
}

export default function Paginator2({dataLength, page, totalPages, pageSize = DEFAULT_PAGE_SIZE, onPageChanged}: {
    dataLength: number,
    page: number,
    totalPages: number,
    pageSize?: number,
    onPageChanged: (pageNum: number) => void
}) {
    const {t} = useI18n()
    const [jump, setJump] = useState('')

    if (totalPages <= 1) return null

    const items = getPageItems(page, totalPages)
    const showJump = totalPages > WINDOW_THRESHOLD

    const submitJump = (e: FormEvent) => {
        e.preventDefault()
        const n = Number.parseInt(jump, 10)
        if (Number.isNaN(n)) return
        const clamped = Math.min(Math.max(n, 1), totalPages)
        onPageChanged(clamped - 1)
        setJump('')
    }

    const navBtn =
        'px-3 py-1 rounded-[9px] text-3 font-medium text-secondary border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-2)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed'

    return (
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-[var(--border)] bg-[var(--surface-2)]">
            <span className="text-3 text-muted">
                {dataLength === 0 ? '0 results' : `${page * pageSize + 1}–${Math.min((page + 1) * pageSize, dataLength)} of ${dataLength}`}
            </span>
            <div className="flex items-center gap-1">
                <button disabled={page === 0} onClick={() => onPageChanged(page - 1)}
                        aria-label={t('common.prev')} className={navBtn}>{t('common.prev')}</button>
                {items.map((item) =>
                    typeof item === 'number' ? (
                        <button key={item} onClick={() => onPageChanged(item)}
                                aria-current={page === item ? 'page' : undefined}
                                className={`w-7 h-7 rounded-[9px] text-3 font-semibold transition-colors ${page === item ? 'bg-accent text-white' : 'text-secondary hover:bg-[var(--surface-2)]'}`}>
                            {item + 1}
                        </button>
                    ) : (
                        <span key={item} className="w-7 h-7 flex items-center justify-center text-3 text-muted select-none">…</span>
                    )
                )}
                <button disabled={page >= totalPages - 1} onClick={() => onPageChanged(page + 1)}
                        aria-label={t('common.next')} className={navBtn}>{t('common.next')}</button>

                {showJump && (
                    <form onSubmit={submitJump} className="flex items-center gap-1 ms-2">
                        <label className="text-3 text-muted whitespace-nowrap">{t('common.goToPage')}</label>
                        <input
                            type="number"
                            min={1}
                            max={totalPages}
                            value={jump}
                            onChange={(e) => setJump(e.target.value)}
                            aria-label={t('common.goToPage')}
                            className="w-14 px-2 py-1 rounded-[9px] text-3 text-primary bg-[var(--surface)] border border-[var(--border)] focus:outline-none focus:border-accent"
                        />
                        <button type="submit" aria-label={t('common.go')} className={navBtn}>{t('common.go')}</button>
                    </form>
                )}
            </div>
        </div>
    )
}
