import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'
import {
  HiOutlineArrowLeft,
  HiOutlineChatBubbleOvalLeftEllipsis,
  HiOutlineXMark,
  HiOutlineArrowsPointingOut,
} from 'react-icons/hi2'
import { useI18n } from '../../../../infra/locales/I18nContext'
import useAuthStore, { selectUserPermissions } from '../../../../infra/auth/useAuthStore'
import { canAccess } from '../../../../infra/shared/utils/menuUtils'
import useClassroomStore from '../../virtual-classroom/classroomStore'
import useChatStore, { selectTotalUnread } from '../chat-store'
import ConversationList from '../components/ConversationList'
import ChatThread from '../components/ChatThread'
import NewChatModal from '../components/NewChatModal'
import { CHAT_ACCESS } from '../ChatRuntimeProvider'
import useChatWidgetStore from './useChatWidgetStore'

const CHAT_PAGE_PREFIX = '/communication-reporting/chat'
const BTN_SIZE = 56
const DEFAULT_RIGHT = 20

/**
 * Floating chat launcher + panel, mounted once in the authenticated Layout so
 * live chat is reachable from every screen. Pure view over the same chat store
 * the Chat page uses — the socket itself lives in ChatRuntimeProvider.
 *
 * Hidden on the Chat page (redundant there) and while a virtual-classroom
 * session is active (the docked classroom occupies the same corner).
 */
export default function ChatWidget() {
  const { t } = useI18n()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const permissions = useAuthStore(selectUserPermissions)
  const classroomActive = useClassroomStore((s) => !!s.active)
  const { isOpen, close, toggle } = useChatWidgetStore(
    useShallow((s) => ({ isOpen: s.isOpen, close: s.close, toggle: s.toggle })),
  )
  const totalUnread = useChatStore(selectTotalUnread)
  const activeConvId = useChatStore((s) => s.activeConvId)
  const [pickerOpen, setPickerOpen] = useState(false)

  // Draggable launcher bubble — top & right positions
  interface Position { top: number; right: number }
  const [buttonPos, setButtonPos] = useState<Position | null>(() => {
    try {
      const saved = localStorage.getItem('chat-widget-button-pos')
      if (saved) {
        const parsed: Position = JSON.parse(saved)
        if (parsed && typeof parsed.top === 'number' && typeof parsed.right === 'number') return parsed
      }
    } catch {
      // ignore
    }
    return null
  })
  const draggingRef = useRef(false)
  const dragStartXRef = useRef(0)
  const dragStartYRef = useRef(0)
  const dragStartBtnLeftRef = useRef(0)
  const dragStartBtnTopRef = useRef(0)
  const justDraggedRef = useRef(false)
  const buttonRef = useRef<HTMLButtonElement>(null)

  const hidden =
    !canAccess(CHAT_ACCESS, permissions) ||
    pathname.startsWith(CHAT_PAGE_PREFIX) ||
    classroomActive

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    justDraggedRef.current = false
    draggingRef.current = true
    dragStartXRef.current = e.clientX
    dragStartYRef.current = e.clientY

    if (buttonPos) {
      dragStartBtnLeftRef.current = window.innerWidth - buttonPos.right - BTN_SIZE
      dragStartBtnTopRef.current = buttonPos.top
    } else {
      const vh = window.innerHeight
      dragStartBtnLeftRef.current = window.innerWidth - DEFAULT_RIGHT - BTN_SIZE
      dragStartBtnTopRef.current = vh - 80 - BTN_SIZE
    }

    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!draggingRef.current) return
    justDraggedRef.current = true

    const deltaX = e.clientX - dragStartXRef.current
    const deltaY = e.clientY - dragStartYRef.current

    let newLeft = dragStartBtnLeftRef.current + deltaX
    let newTop = dragStartBtnTopRef.current + deltaY

    newLeft = Math.max(0, Math.min(window.innerWidth - BTN_SIZE, newLeft))
    newTop = Math.max(0, Math.min(window.innerHeight - BTN_SIZE, newTop))

    setButtonPos({ top: newTop, right: window.innerWidth - newLeft - BTN_SIZE })
  }

  const handlePointerUp = () => {
    draggingRef.current = false
  }

  const handleButtonClick = () => {
    if (justDraggedRef.current) return
    toggle()
  }

  // Persist button position to localStorage
  useEffect(() => {
    if (buttonPos) {
      localStorage.setItem('chat-widget-button-pos', JSON.stringify(buttonPos))
    } else {
      localStorage.removeItem('chat-widget-button-pos')
    }
  }, [buttonPos])

  // While the panel is genuinely visible, count as "actively chatting" so the
  // store skips unread increments for the open conversation (same flag the
  // Chat page sets; the two are never visible at once — the widget is hidden
  // on the Chat page route).
  const panelVisible = isOpen && !hidden
  useEffect(() => {
    if (!panelVisible) return
    useChatStore.getState().setChatSectionVisible(true)
    return () => useChatStore.getState().setChatSectionVisible(false)
  }, [panelVisible])

  if (hidden) return null

  const btnStyle: React.CSSProperties = {
    background: 'var(--accent)',
    ...(buttonPos
      ? { top: `${buttonPos.top}px`, right: `${buttonPos.right}px` }
      : { bottom: '5px', right: `${DEFAULT_RIGHT}px` }),
  }

  return (
    <>
      {panelVisible && (
        <div className="fixed inset-0 lg:inset-auto lg:bottom-5 lg:end-5 z-40 flex flex-col lg:w-[380px] lg:h-[560px] lg:max-h-[calc(100vh-3rem)] lg:rounded-xl shadow-elevated overflow-hidden bg-surface border border-bd">
          {/* Widget header: left (back) + title (centered) + right (fullscreen + close) */}
          <div
            className="flex items-center px-4 py-3 shrink-0 text-white"
            style={{ background: 'var(--accent)' }}
          >
            <div className="flex-1 flex">
              <h1 className="flex-1 min-w-0 mx-2 text-center text-[14px] font-bold leading-tight">
                {t('chat.widget.title')}
              </h1>
              {activeConvId && (
                <button
                  type="button"
                  onClick={() => useChatStore.getState().setActiveConversation(null)}
                  aria-label={t('chat.widget.back')}
                  className="p-1.5 -me-1.5 rounded-md hover:bg-white/15 transition-colors shrink-0"
                >
                  <HiOutlineArrowLeft className="w-5 h-5 rtl:rotate-180" />
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => navigate(`${CHAT_PAGE_PREFIX}`)}
                aria-label={t('chat.widget.fullscreen')}
                className="p-1.5 rounded-md hover:bg-white/15 transition-colors"
              >
                <HiOutlineArrowsPointingOut className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={close}
                aria-label={t('chat.widget.close')}
                className="p-1.5 -me-1.5 rounded-md hover:bg-white/15 transition-colors"
              >
                <HiOutlineXMark className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Body: stacked navigation — list, or the active thread */}
          <div className="flex-1 min-h-0 flex flex-col">
            {activeConvId ? (
              <ChatThread
                emptyTitle={t('chat.emptyThreadTitle')}
                emptyHint={t('chat.emptyThreadHint')}
                composerPlaceholder={t('chat.composerPlaceholder')}
                sendLabel={t('chat.send')}
                onlineLabel={t('chat.online')}
                offlineLabel={t('chat.offline')}
                typingLabel={t('chat.typing')}
                todayLabel={t('chat.today')}
                yesterdayLabel={t('chat.yesterday')}
              />
            ) : (
              <ConversationList
                onNewChat={() => setPickerOpen(true)}
                onSelect={(id) => useChatStore.getState().setActiveConversation(id)}
              />
            )}
          </div>
        </div>
      )}

      {/* Launcher bubble. Hidden while the panel is open — closing is the
          header X's job, and the panel takes over the bottom corner. */}
      {!panelVisible && (
        <button
          ref={buttonRef}
          type="button"
          onClick={handleButtonClick}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          aria-label={t('chat.widget.open')}
          className="fixed z-40 flex items-center justify-center w-14 h-14 rounded-full text-white shadow-elevated transition-transform hover:scale-105 active:scale-95"
          style={btnStyle}
        >
          <HiOutlineChatBubbleOvalLeftEllipsis className="w-6 h-6" />
          {totalUnread > 0 && (
            <span
              className="absolute -top-1 -end-1 min-w-[20px] h-5 px-1.5 inline-flex items-center justify-center rounded-full text-[11px] font-bold text-white border-2 border-[var(--surface)]"
              style={{ background: 'var(--danger, #DC2626)' }}
            >
              {totalUnread > 99 ? '99+' : totalUnread}
            </span>
          )}
        </button>
      )}

      <NewChatModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onConversationOpened={(id) => useChatStore.getState().setActiveConversation(id)}
        title={t('chat.newConversation')}
        searchPlaceholder={t('chat.searchUsers')}
        unavailableLabel={t('chat.unsupportedRole')}
      />
    </>
  )
}
