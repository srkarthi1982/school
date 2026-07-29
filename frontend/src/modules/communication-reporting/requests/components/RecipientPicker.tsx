import { useEffect, useRef, useState } from 'react'
import { searchUsers, type ChatUser } from '../requests-api'

interface Props {
  value: ChatUser | null
  onChange: (user: ChatUser | null) => void
  placeholder?: string
}

export default function RecipientPicker({ value, onChange, placeholder }: Props) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<ChatUser[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    let alive = true
    const handle = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await searchUsers(q, undefined, 15)
        if (alive) setResults(res.items)
      } finally {
        if (alive) setLoading(false)
      }
    }, 200)
    return () => {
      alive = false
      clearTimeout(handle)
    }
  }, [q, open])

  useEffect(() => {
    const onMousedown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        e.stopPropagation()
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onMousedown)
    return () => document.removeEventListener('mousedown', onMousedown)
  }, [])

  return (
    <div ref={containerRef} className="relative">
      {value ? (
        <div
          className="flex items-center gap-2 rounded-[10px] border px-3 py-2 bg-[var(--surface-2)]"
          style={{ borderColor: 'var(--border)' }}
        >
          <span className="text-[13px] font-semibold text-primary">{value.full_name}</span>
          <span className="text-[11.5px] text-muted">@{value.username}</span>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="ms-auto text-[11.5px] text-muted hover:text-primary cursor-pointer bg-transparent border-none"
          >
            Change
          </button>
        </div>
      ) : (
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder={placeholder ?? 'Search user…'}
          className="w-full rounded-[10px] border bg-[var(--surface-2)] px-3 py-2 text-[13px] text-primary placeholder:text-muted focus:outline-none focus:border-[var(--accent)]"
          style={{ borderColor: 'var(--border)' }}
        />
      )}

      {open && !value && (
        <div
          className="absolute left-0 right-0 mt-1 z-20 rounded-[10px] border bg-[var(--surface)] shadow-md max-h-[260px] overflow-y-auto"
          style={{ borderColor: 'var(--border)' }}
        >
          {loading ? (
            <div className="px-3 py-2 text-[12px] text-muted">Searching…</div>
          ) : results.length === 0 ? (
            <div className="px-3 py-2 text-[12px] text-muted">No users found</div>
          ) : (
            results.map((u) => (
              <button
                key={u.id}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  onChange(u)
                  setOpen(false)
                  setQ('')
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-start hover:bg-[var(--surface-2)] cursor-pointer bg-transparent border-none"
              >
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
