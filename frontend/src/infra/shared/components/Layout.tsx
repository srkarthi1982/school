import { Outlet, useLocation } from 'react-router-dom'
import SidebarMenu from './SidebarMenu'
import SubmenuAside from './SubmenuAside'
import BottomNav from './BottomNav'
import MobileModuleHeader from './MobileModuleHeader'
import MobileSubmenuTabs from './MobileSubmenuTabs'
import { MENU_CONFIG } from '../../config/menu.config'
import { findActiveModule } from '../utils/menuUtils'
import useFullBleedStore from '../store/useFullBleedStore'
import ConfirmHost from './ConfirmHost'
import ClassroomMount from '../../../modules/communication-reporting/virtual-classroom/components/ClassroomMount'
import ChatWidget from '../../../modules/communication-reporting/chat/widget/ChatWidget'
import GuideEngine from '../../guides/GuideEngine'

export default function Layout() {
  const location = useLocation()
  const activeModule = findActiveModule(MENU_CONFIG, location.pathname)
  const showSubmenu = !!activeModule?.children?.length
  // When a route requests full-bleed (e.g. the document reader), drop the
  // standard content padding/frame so it fills the area edge-to-edge.
  const fullBleed = useFullBleedStore((s) => s.fullBleed)

  return (
    <div className="h-screen flex flex-col lg:flex-row overflow-hidden bg-bg">

      {/* -- Desktop sidebar (hidden < lg) -- */}
      <aside
        className="hidden lg:flex thin-scrollbar w-[140px] shrink-0 h-full flex-col overflow-y-auto"
        style={{ background: 'var(--sidebar-gradient)' }}
      >
        <SidebarMenu items={MENU_CONFIG} />
      </aside>

      {/* -- Main column -- */}
      <main className="flex-1 flex flex-col min-h-0 bg-bg overflow-hidden relative">
        {/* Mobile-only module header + submenu tabs */}
        {showSubmenu && (
          <>
            <MobileModuleHeader module={activeModule!} className="lg:hidden" />
            <MobileSubmenuTabs module={activeModule!} className="lg:hidden" />
          </>
        )}

        {/* Content row: desktop submenu aside + outlet. The p-6 frame is kept
            ALWAYS so the submenu always has its padding; only the reader (Outlet)
            bleeds past it when full-bleed, via overflow-visible + the wrapper's
            negative margins below. */}
        <div className={`flex-1 flex min-h-0 overflow-hidden lg:p-6 ${fullBleed ? 'lg:overflow-visible' : ''}`}>
          {showSubmenu && (
            <>
              <SubmenuAside module={activeModule!} className="hidden lg:flex" />
              <div className="hidden lg:block w-px bg-[var(--border)] self-stretch mx-0 shrink-0" />
            </>
          )}
          <div
            data-guide="page-main"
            className={
              `thin-scrollbar-light flex-1 min-w-0 overflow-y-auto ` +
              (fullBleed
                // Reader bleeds to the main-column edges (cancels the frame on
                // top/right/bottom); the submenu keeps its padding untouched.
                ? `pb-20 lg:p-0 lg:pb-0 lg:-mt-6 lg:-mb-6 lg:-me-6 lg:w-[calc(100%+1.5rem)] lg:h-[calc(100%+3rem)]`
                : `p-4 pb-20 lg:p-0 lg:pt-1 ` + (showSubmenu ? 'lg:ps-8' : ''))
            }
          >
            <Outlet />
          </div>
        </div>

        {/* -- Persistent virtual-classroom overlay. Lives inside <main> so
              the desktop sidebar stays visible in fullscreen mode and the
              LiveKit connection survives route changes (Outlet remounts but
              ClassroomMount does not). -- */}
        <ClassroomMount />

        {/* -- Floating live-chat launcher/panel. Like ClassroomMount it
              survives route changes; the chat socket itself lives higher up
              in ChatRuntimeProvider so it also survives this widget. -- */}
        <ChatWidget />

        {/* -- Agent-guided walkthrough engine. Mounts once so it has router
              context; renders nothing but the driver.js spotlight on demand. -- */}
        <GuideEngine />
      </main>

      {/* -- Mobile bottom nav (hidden lg+) -- */}
      <BottomNav items={MENU_CONFIG} className="lg:hidden" />

      {/* -- App-level confirmation dialog host (confirmDialog()) -- */}
      <ConfirmHost />
    </div>
  )
}
