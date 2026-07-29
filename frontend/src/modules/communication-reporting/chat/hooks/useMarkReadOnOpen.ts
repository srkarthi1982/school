import { useEffect } from 'react'
import useChatStore from '../chat-store'
import { markRead } from '../chat-api'
import type { SocketSenders } from '../chat-types'

export default function useMarkReadOnOpen(
  conversationId: string | null,
  senders: SocketSenders,
  messageCount: number,
) {
  useEffect(() => {
    if (!conversationId) return
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
    senders.sendRead(conversationId)
    useChatStore.getState().clearUnread(conversationId)
    void markRead(conversationId).catch(() => { /* ignore */ })
  }, [conversationId, messageCount, senders])
}
