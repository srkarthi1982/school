import { useCallback } from 'react'
import type { ReactNode } from 'react'
import useAuthStore, { selectUserPermissions } from '../../../infra/auth/useAuthStore'
import { canAccess } from '../../../infra/shared/utils/menuUtils'
import type { AccessRequirement } from '../../../infra/shared/types/permissions'
import useToastStore from '../../../infra/shared/store/useToastStore'
import useChatStore from './chat-store'
import useChatBootstrap from './hooks/useChatBootstrap'
import useChatSocket from './hooks/useChatSocket'
import { ChatSocketContext } from './ChatSocketContext'
import useChatWidgetStore from './widget/useChatWidgetStore'
import type { MessageResponse } from './chat-types'

// Same gate as the communication-reporting module manifest — the socket only
// connects for users who can actually reach the chat feature.
export const CHAT_ACCESS: AccessRequirement = { permissions: ['teacher:*', 'student:*'] }
const CHAT_PAGE_PREFIX = '/communication-reporting/chat'
const TOAST_PREVIEW_MAX = 80

function messagePreview(message: MessageResponse): string {
  const text = message.content?.trim()
  if (text) return text.length > TOAST_PREVIEW_MAX ? `${text.slice(0, TOAST_PREVIEW_MAX)}…` : text
  return (message.attachments?.length ?? 0) > 0 ? '📎' : ''
}

function ChatRuntime({ children }: { children: ReactNode }) {
  useChatBootstrap()

  const onIncomingMessage = useCallback((conversationId: string, message: MessageResponse) => {
    // On the Chat page the conversation list already surfaces unread markers;
    // a toast there would be noise. (Read at event time, not render time.)
    if (window.location.pathname.startsWith(CHAT_PAGE_PREFIX)) return
    // Per-document chats belong to the reader panel; the main chat surfaces
    // (widget/list) don't show them, so a toast would open a dead end.
    if (useChatStore.getState().conversations[conversationId]?.kind === 'agent_doc') return
    useToastStore.getState().push({
      variant: 'info',
      title: message.sender.display_name || message.sender.full_name,
      body: messagePreview(message),
      onClick: () => useChatWidgetStore.getState().openConversation(conversationId),
    })
  }, [])

  const { senders } = useChatSocket({ onIncomingMessage })

  return <ChatSocketContext.Provider value={senders}>{children}</ChatSocketContext.Provider>
}

/**
 * Mounts the chat runtime (WebSocket + conversation bootstrap) for the whole
 * authenticated shell, so chat is live from login on every screen — not just
 * while the Chat page is open. Renders children untouched for users without
 * chat access; ChatSocketContext then falls back to its no-op senders.
 */
export default function ChatRuntimeProvider({ children }: { children: ReactNode }) {
  const permissions = useAuthStore(selectUserPermissions)
  if (!canAccess(CHAT_ACCESS, permissions)) return <>{children}</>
  return <ChatRuntime>{children}</ChatRuntime>
}
