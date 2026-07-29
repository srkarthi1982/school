import { useLayoutEffect, useRef, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { filterMenuForSidebar } from '../utils/menuUtils'
import useAuthStore, { selectUserPermissions } from '../../auth/useAuthStore'
import type { MenuItem } from '../types/permissions'
import { useI18n } from '../../locales/I18nContext'

interface BarPos { top: number; height: number }

export default function SidebarMenu({ items }: { items: MenuItem[] }) {
  const userPerms = useAuthStore(selectUserPermissions)
  const { t } = useI18n()
  const location = useLocation()

  const visible = filterMenuForSidebar(items, userPerms)
  const groups        = visible.filter(g => !g.pinBottom)
  const bottomGroups  = visible.filter(g =>  g.pinBottom)

  const navRef = useRef<HTMLElement>(null)
  const [bar, setBar] = useState<BarPos | null>(null)

  useLayoutEffect(() => {
    const nav = navRef.current
    if (!nav) return
    const measure = () => {
      const active = nav.querySelector<HTMLElement>('[aria-current="page"]')
      if (!active) { setBar(null); return }
      const a = active.getBoundingClientRect()
      const n = nav.getBoundingClientRect()
      setBar({ top: a.top - n.top + a.height * 0.18, height: a.height * 0.64 })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(nav)
    window.addEventListener('resize', measure)
    return () => { ro.disconnect(); window.removeEventListener('resize', measure) }
  }, [location.pathname, visible.length])

  const renderItem = (item: MenuItem) => {
    const Icon = item.icon
    return (
      <NavLink
        key={item.path}
        to={item.path!}
        end={item.path === '/'}
        data-guide={`nav:${item.path}`}
        style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}
        className={({ isActive }) => `nav-btn${isActive ? ' active' : ''} `}
      >
        {Icon && <Icon className="text-[42px] shrink-0" />}
        <span className="nav-btn-label text-[14px]">{t(item.i18n)}</span>
      </NavLink>
    )
  }

  return (
    <nav ref={navRef} className="relative flex flex-col grow min-h-0">
      <span
        aria-hidden
        className="sidebar-active-indicator"
        style={bar
          ? { transform: `translateY(${bar.top}px)`, height: `${bar.height}px`, opacity: 1 }
          : { opacity: 0 }}
      />
      <div className="flex flex-col">
        {groups.map(renderItem)}
      </div>

      {bottomGroups.length > 0 && (
        <div className="mt-auto border-t border-white/[0.07]">
          {bottomGroups.map(renderItem)}
        </div>
      )}
    </nav>
  )
}
