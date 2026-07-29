import { useLayoutEffect, useRef, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useI18n } from '../../locales/I18nContext'
import useAuthStore, { selectUserPermissions } from '../../auth/useAuthStore'
import { canAccess, joinPath, toNavPath } from '../utils/menuUtils'
import type { MenuItem } from '../types/permissions'

type Props = { module: MenuItem; className?: string }

interface PillPos { left: number; width: number }

export default function MobileSubmenuTabs({ module, className }: Props) {
  const { t } = useI18n()
  const userPerms = useAuthStore(selectUserPermissions)
  const location = useLocation()

  const visible = (module.children ?? []).filter(c =>
    canAccess(
      { permissions: c.permissions ?? module.permissions },
      userPerms,
    ),
  )

  const navRef = useRef<HTMLDivElement>(null)
  const [pill, setPill] = useState<PillPos | null>(null)

  useLayoutEffect(() => {
    const nav = navRef.current
    if (!nav) return
    const measure = () => {
      const active = nav.querySelector<HTMLElement>('[aria-current="page"]')
      if (!active) { setPill(null); return }
      setPill({ left: active.offsetLeft, width: active.offsetWidth })
      // Scroll active into view if needed (for very narrow screens with many tabs)
      active.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(nav)
    window.addEventListener('resize', measure)
    return () => { ro.disconnect(); window.removeEventListener('resize', measure) }
  }, [location.pathname, visible.length])

  if (!visible.length) return null

  return (
    <div
      ref={navRef}
      className={`mobile-submenu-tabs relative flex gap-1.5 overflow-x-auto thin-scrollbar-light px-3 py-2 border-b border-[var(--border)] bg-bg shrink-0 ${className ?? ''}`}
    >
      <span
        aria-hidden
        className="mobile-submenu-pill"
        style={pill
          ? { transform: `translateX(${pill.left}px)`, width: `${pill.width}px`, opacity: 1 }
          : { opacity: 0 }}
      />
      {visible.map(child => {
        const fullPath = toNavPath(joinPath(module.path!, child.path))
        return (
          <NavLink
            key={fullPath}
            to={fullPath}
            data-guide={`nav:${fullPath}`}
            className={({ isActive }) =>
              `mobile-submenu-tab relative z-[1] px-3 py-1.5 rounded-full text-[13px] font-medium whitespace-nowrap shrink-0 ${
                isActive ? 'text-accent' : 'text-muted hover:text-primary'
              }`
            }
          >
            {child.i18n ? t(child.i18n) : child.path}
          </NavLink>
        )
      })}
    </div>
  )
}
