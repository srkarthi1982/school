import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useI18n } from '../../locales/I18nContext'
import type { MenuItem } from '../types/permissions'

type Props = {
  open: boolean
  items: MenuItem[]
  onClose: () => void
}

const TRANSITION_MS = 300

export default function MoreSheet({ open, items, onClose }: Props) {
  const { t } = useI18n()
  const [mounted, setMounted] = useState(false)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (open) {
      setMounted(true)
      // Two RAFs so the browser commits the off-screen state before transitioning in.
      let raf2 = 0
      const raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => setVisible(true))
      })
      return () => {
        cancelAnimationFrame(raf1)
        if (raf2) cancelAnimationFrame(raf2)
      }
    }
    setVisible(false)
    const t = setTimeout(() => setMounted(false), TRANSITION_MS)
    return () => clearTimeout(t)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!mounted) return null

  return (
    <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
      <div
        className={`absolute inset-0 bg-black/40 transition-opacity ease-out ${visible ? 'opacity-100' : 'opacity-0'}`}
        style={{ transitionDuration: `${TRANSITION_MS}ms` }}
        onClick={onClose}
      />
      <div
        className={`absolute bottom-0 inset-x-0 rounded-t-2xl bg-bg max-h-[70vh] overflow-y-auto thin-scrollbar-light shadow-[0_-8px_24px_rgba(0,0,0,0.25)] transition-transform ease-out will-change-transform ${visible ? 'translate-y-0' : 'translate-y-full'}`}
        style={{ transitionDuration: `${TRANSITION_MS}ms` }}
      >
        <div className="flex justify-center pt-2 pb-1">
          <div className="w-10 h-1 rounded-full bg-[var(--border)]" />
        </div>
        <nav className="flex flex-col p-2 pb-6">
          {items.map(item => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.path}
                to={item.path!}
                onClick={onClose}
                data-guide={`nav:${item.path}`}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-3 rounded-[10px] text-[14px] font-medium ${
                    isActive ? 'bg-accent-light text-accent' : 'text-primary'
                  }`
                }
              >
                {Icon && <Icon className="text-[20px] shrink-0" />}
                <span>{item.i18n ? t(item.i18n) : item.path}</span>
              </NavLink>
            )
          })}
        </nav>
      </div>
    </div>
  )
}
