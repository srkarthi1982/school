import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'
import {
  HiOutlineChatBubbleLeftRight,
  HiOutlineEnvelope,
  HiOutlineMegaphone,
  HiOutlineDocumentChartBar,
  HiOutlineArrowDownTray,
  HiOutlineChatBubbleOvalLeftEllipsis,
} from 'react-icons/hi2'
import { useI18n } from '../../../infra/locales/I18nContext'
import useCommunicationReportingDefaultStore from '../store'
import useChatStore, { selectTotalUnread } from '../chat/chat-store'
import ChatSection from '../chat/ChatSection'

type SectionId = 'inbox' | 'announcements' | 'reports' | 'chat'

interface NavItem { id: SectionId; label: string; icon: React.ReactNode }


export default function ChatPage() {
  const { t } = useI18n()
  const [searchParams] = useSearchParams()
  const [active, setActive] = useState<SectionId>('inbox')

  // Socket + data bootstrap live app-wide in ChatRuntimeProvider (chat is
  // live from login); this page is just another view over the chat store.
  useEffect(() => {
    const conversationId = searchParams.get('conversation')
    if (conversationId) {
      setActive('chat')
      useChatStore.getState().setActiveConversation(conversationId)
    }
  }, [searchParams])

  useEffect(() => {
    useChatStore.getState().setChatSectionVisible(active === 'chat')
    return () => useChatStore.getState().setChatSectionVisible(false)
  }, [active])

  const { inbox, announcements, reports, markRead } = useCommunicationReportingDefaultStore(
    useShallow((s) => ({
      inbox:         s.inbox,
      announcements: s.announcements,
      reports:       s.reports,
      markRead:      s.markRead,
    })),
  )

  const unreadCount = inbox.filter((m) => m.unread).length
  const chatUnread = useChatStore(selectTotalUnread)

  const NAV: NavItem[] = [
    { id: 'inbox',         label: 'Inbox',         icon: <HiOutlineEnvelope /> },
    { id: 'announcements', label: 'Announcements', icon: <HiOutlineMegaphone /> },
    { id: 'reports',       label: 'Reports',       icon: <HiOutlineDocumentChartBar /> },
    { id: 'chat',          label: t('chat.tab'),   icon: <HiOutlineChatBubbleOvalLeftEllipsis /> },
  ]
  const current = NAV.find((n) => n.id === active)!
  const isChat = active === 'chat'

  return (
    <div className="flex h-full min-h-0 gap-0">
      <div
        className={`flex-1 min-w-0 flex flex-col min-h-0`}
      >
        <ChatSection />
      </div>
    </div>
  )
}
