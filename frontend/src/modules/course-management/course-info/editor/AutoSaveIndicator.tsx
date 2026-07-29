import { useEffect, useState } from 'react'

interface Props {
  lastAutoSavedAt: Date | null
}

export default function AutoSaveIndicator({ lastAutoSavedAt }: Props) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!lastAutoSavedAt) return
    setVisible(true)
    const id = setTimeout(() => setVisible(false), 3500)
    return () => clearTimeout(id)
  }, [lastAutoSavedAt])

  if (!visible || !lastAutoSavedAt) return null

  const time = lastAutoSavedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  return (
    <span className="text-[12px] text-emerald-600 font-medium flex items-center gap-1.5" style={{ animation: 'fade-out 3.5s ease-out forwards' }}>
      <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
        <path d="M5 8.5l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Auto-saved {time}
    </span>
  )
}