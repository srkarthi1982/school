import { useLayoutEffect, useRef, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useI18n } from '../../locales/I18nContext'
import type { MenuItem } from '../types/permissions'
import useAuthStore, { selectUserPermissions } from '../../auth/useAuthStore'
import { canAccess, joinPath, toNavPath } from '../utils/menuUtils'

type Props = { module: MenuItem; className?: string }

interface PillPos { top: number; height: number }

export default function SubmenuAside({ module, className }: Props) {
  const { t } = useI18n()
  const userPerms = useAuthStore(selectUserPermissions)
  const location = useLocation()
  const Icon = module.icon

  const visible = (module.children ?? []).filter(c =>
    canAccess(
      { permissions: c.permissions ?? module.permissions },
      userPerms,
    ),
  )

  const navRef = useRef<HTMLElement>(null)
  const [pill, setPill] = useState<PillPos | null>(null)

  useLayoutEffect(() => {
    const nav = navRef.current
    if (!nav) return
    const measure = () => {
      const active = nav.querySelector<HTMLElement>('[aria-current="page"]')
      if (!active) { setPill(null); return }
      const a = active.getBoundingClientRect()
      const n = nav.getBoundingClientRect()
      setPill({ top: a.top - n.top + nav.scrollTop, height: a.height })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(nav)
    window.addEventListener('resize', measure)
    return () => { ro.disconnect(); window.removeEventListener('resize', measure) }
  }, [location.pathname, visible.length])

  if (!visible.length) return null

  return (
    <aside className={`w-[220px] shrink-0 flex flex-col pe-3 pt-1 ${className ?? ''}`}>
      <div className="px-3 mb-4">
        <div className="flex items-center gap-2.5 mb-3">
          {Icon && (
            <div className="w-9 h-9 rounded-[10px] bg-accent-light text-accent flex items-center justify-center shrink-0">
              <Icon className="text-[18px]" />
            </div>
          )}
          {module.i18n && (
            <div className="min-w-0">
              <h1 className="text-[14px] font-semibold text-primary leading-[1.2] tracking-[-0.01em]">
                {t(module.i18n)}
              </h1>
              <p className="text-[10px] uppercase tracking-[0.1em] text-muted/70 mt-1.5 leading-none">
                {visible.length} {visible.length === 1 ? 'section' : 'sections'}
              </p>
            </div>
          )}
        </div>
        <div className="h-px w-full bg-[var(--border)] opacity-60" />
      </div>

      <nav
        ref={navRef}
        className="submenu-nav relative flex flex-col overflow-y-auto thin-scrollbar-light px-1"
      >
        <span
          aria-hidden
          className="submenu-active-pill"
          style={pill
            ? { transform: `translateY(${pill.top}px)`, height: `${pill.height}px`, opacity: 1 }
            : { opacity: 0 }}
        />
        {visible.map(child => {
          const fullPath = toNavPath(joinPath(module.path!, child.path))
          const Badge = child.badge
          return (
            <NavLink
              key={fullPath}
              to={fullPath}
              data-guide={`nav:${fullPath}`}
              className={({ isActive }) =>
                `submenu-link relative z-[1] flex items-center gap-2.5 px-3 py-2.5 rounded-[10px] text-[13px] font-medium ${
                  isActive ? 'text-accent' : 'text-muted hover:text-primary'
                }`
              }
            >
              <span className="whitespace-nowrap truncate">
                {child.i18n ? t(child.i18n) : child.path}
              </span>
              {Badge && <Badge className="text-[42px] shrink-0 ms-auto" />}
            </NavLink>
          )
        })}
      </nav>
    </aside>
  )
}
