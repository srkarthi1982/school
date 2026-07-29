import { useLayoutEffect, useRef, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { HiEllipsisHorizontal } from 'react-icons/hi2'
import { useI18n } from '../../locales/I18nContext'
import useAuthStore, { selectUserPermissions } from '../../auth/useAuthStore'
import { filterMenuForSidebar } from '../utils/menuUtils'
import type { MenuItem } from '../types/permissions'
import MoreSheet from './MoreSheet'

type Props = { items: MenuItem[]; className?: string }

const PRIMARY_COUNT = 4

interface BarPos { left: number; width: number }

export default function BottomNav({ items, className }: Props) {
  const { t } = useI18n()
  const userPerms = useAuthStore(selectUserPermissions)
  const [moreOpen, setMoreOpen] = useState(false)
  const location = useLocation()

  const visible = filterMenuForSidebar(items, userPerms)
  const nonPinned = visible.filter(i => !i.pinBottom)
  const pinned    = visible.filter(i =>  i.pinBottom)
  const primary   = nonPinned.slice(0, PRIMARY_COUNT)
  const overflow  = [...nonPinned.slice(PRIMARY_COUNT), ...pinned]
  const hasOverflow = overflow.length > 0

  const navRef = useRef<HTMLElement>(null)
  const moreRef = useRef<HTMLButtonElement>(null)
  const [bar, setBar] = useState<BarPos | null>(null)

  useLayoutEffect(() => {
    const nav = navRef.current
    if (!nav) return
    const measure = () => {
      const target: HTMLElement | null = moreOpen && moreRef.current
        ? moreRef.current
        : nav.querySelector<HTMLElement>('[aria-current="page"]')
      if (!target) { setBar(null); return }
      const r = target.getBoundingClientRect()
      const n = nav.getBoundingClientRect()
      const pad = r.width * 0.18
      setBar({ left: r.left - n.left + pad, width: r.width - pad * 2 })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(nav)
    window.addEventListener('resize', measure)
    return () => { ro.disconnect(); window.removeEventListener('resize', measure) }
  }, [location.pathname, moreOpen, primary.length, hasOverflow])

  const renderLink = (item: MenuItem) => {
    const Icon = item.icon
    return (
      <NavLink
        key={item.path}
        to={item.path!}
        end={item.path === '/'}
        data-guide={`nav:${item.path}`}
        className={({ isActive }) =>
          `bnav-link flex flex-col items-center justify-center gap-1 flex-1 min-w-0 h-full px-1 text-[10.5px] font-medium transition-colors ${
            isActive ? 'active text-white' : 'text-white/55'
          }`
        }
      >
        {Icon && <Icon className="text-[22px] shrink-0" />}
        <span className="truncate max-w-full leading-tight">{t(item.i18n)}</span>
      </NavLink>
    )
  }

  return (
    <>
      <nav
        ref={navRef}
        className={`fixed bottom-0 inset-x-0 h-16 flex z-40 shadow-[0_-2px_8px_rgba(0,0,0,0.18)] ${className ?? ''}`}
        style={{ background: 'var(--sidebar-gradient)' }}
      >
        <span
          aria-hidden
          className="bottom-nav-indicator"
          style={bar
            ? { transform: `translateX(${bar.left}px)`, width: `${bar.width}px`, opacity: 1 }
            : { opacity: 0 }}
        />
        {primary.map(renderLink)}
        {hasOverflow && (
          <button
            ref={moreRef}
            type="button"
            onClick={() => setMoreOpen(true)}
            className={`bnav-link flex flex-col items-center justify-center gap-1 flex-1 min-w-0 h-full px-1 text-[10.5px] font-medium transition-colors ${
              moreOpen ? 'active text-white' : 'text-white/55'
            }`}
          >
            <HiEllipsisHorizontal className="text-[22px] shrink-0" />
            <span className="truncate max-w-full leading-tight">More</span>
          </button>
        )}
      </nav>

      <MoreSheet open={moreOpen} items={overflow} onClose={() => setMoreOpen(false)} />
    </>
  )
}
