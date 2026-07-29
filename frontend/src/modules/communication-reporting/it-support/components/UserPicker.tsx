import { useEffect, useRef, useState } from 'react'
import '../../../../api/client'
import { listItStaffApiV1ItSupportStaffGet as listItStaff } from '../../../../api/generated'
import { useI18n } from '../../../../infra/locales/I18nContext'
import type { User } from '../types'

interface Props {
  value: User | null
  onChange: (user: User | null) => void
  placeholder?: string
}

// Picks an IT staff member — users holding the ticket:respond permission.
export default function UserPicker({ value, onChange, placeholder }: Props) {
  const { t } = useI18n()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [results, setResults] = useState<User[]>([])
  const [loading, setLoading] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    const timer = setTimeout(async () => {
      try {
        const { data } = await listItStaff({ query: { q } })
        if (!cancelled) setResults(data ?? [])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [q, open])

  return (
    <div ref={ref} className="relative">
      {value ? (
        <div className="flex items-center gap-2 rounded-[10px] border px-3 py-2 bg-[var(--surface-2)]" style={{ borderColor: 'var(--border)' }}>
          <span className="text-[13px] font-semibold text-primary">{value.full_name}</span>
          <span className="text-[11.5px] text-muted">@{value.username}</span>
          <button type="button" onClick={() => onChange(null)} className="ms-auto text-[11.5px] text-muted hover:text-primary cursor-pointer bg-transparent border-none">{t('itSupport.picker.change')}</button>
        </div>
      ) : (
        <input type="text" value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => setOpen(true)} placeholder={placeholder ?? t('itSupport.picker.placeholder')} className="w-full rounded-[10px] border bg-[var(--surface-2)] px-3 py-2 text-[13px] text-primary placeholder:text-muted focus:outline-none focus:border-[var(--accent)]" style={{ borderColor: 'var(--border)' }} />
      )}
      {open && !value && (
        <div className="absolute left-0 right-0 mt-1 z-20 rounded-[10px] border bg-[var(--surface)] shadow-md max-h-[260px] overflow-y-auto" style={{ borderColor: 'var(--border)' }}>
          {loading ? (
            <div className="px-3 py-2 text-[12px] text-muted">{t('itSupport.picker.searching')}</div>
          ) : results.length === 0 ? (
            <div className="px-3 py-2 text-[12px] text-muted">{t('itSupport.picker.noResults')}</div>
          ) : (
            results.map((u) => (
              <button key={u.id} type="button" onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); onChange(u); setOpen(false); setQ('') }} className="w-full flex items-center gap-2 px-3 py-2 text-start hover:bg-[var(--surface-2)] cursor-pointer bg-transparent border-none">
                <span className="text-[13px] font-semibold text-primary">{u.full_name}</span>
                <span className="text-[11.5px] text-muted">@{u.username}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
