import { useEffect, useMemo, useRef } from 'react'
import useChatStore from '../chat-store'
import { wsUrl } from '../chat-api'
import type { MessageResponse, SocketSenders, WsInbound, WsOutbound } from '../chat-types'

const TYPING_AUTOCLEAR_MS = 4000
const MAX_BACKOFF_MS = 30000

interface Options {
  /**
   * Fired for message.created frames from other senders that land while the
   * conversation is NOT actively being viewed (thread closed or tab hidden) —
   * i.e. exactly the messages that increment the unread count. Lets the host
   * surface a toast without duplicating the store's active/visible logic.
   */
  onIncomingMessage?: (conversationId: string, message: MessageResponse) => void
}

interface Result {
  senders: SocketSenders
}

export default function useChatSocket(options?: Options): Result {
  const onIncomingMessageRef = useRef(options?.onIncomingMessage)
  onIncomingMessageRef.current = options?.onIncomingMessage

  const socketRef = useRef<WebSocket | null>(null)
  const outboundQueue = useRef<WsOutbound[]>([])
  const reconnectAttempts = useRef(0)
  const reconnectTimer = useRef<number | null>(null)
  const typingTimers = useRef<Map<string, number>>(new Map())
  const closedByUs = useRef(false)

  const {
    appendMessage,
    setTyping,
    applyRead,
    setSocketStatus,
    setPresence,
    upsertConversation,
    deleteMessage,
    applyReaction,
    clearConversation,
    removeConversation,
  } = useChatStore.getState()

  const sendRaw = (frame: WsOutbound) => {
    const ws = socketRef.current
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(frame))
    } else {
      outboundQueue.current.push(frame)
    }
  }

  const flushQueue = () => {
    const ws = socketRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    while (outboundQueue.current.length > 0) {
      const f = outboundQueue.current.shift()!
      ws.send(JSON.stringify(f))
    }
  }

  const handleInbound = (frame: WsInbound) => {
    switch (frame.type) {
      case 'connection.ready': {
        // The store's me may already be set by useChatBootstrap; this is defensive.
        if (!useChatStore.getState().me) {
          useChatStore.getState().setMe({
            id: frame.user_id,
            username: frame.username ?? '',
            full_name: frame.full_name ?? '',
            display_name: frame.display_name ?? '',
            roles: frame.roles,
          })
        }
        break
      }
      case 'message.created': {
        const { activeConvId, chatSectionVisible, visibleConvIds } = useChatStore.getState()
        const isActive =
          (chatSectionVisible && activeConvId === frame.conversation_id) ||
          Boolean(visibleConvIds[frame.conversation_id])
        const isVisible =
          typeof document !== 'undefined' && document.visibilityState === 'visible'
        appendMessage(frame.conversation_id, frame.message, { isActive, isVisible })
        if (!frame.message.is_mine && (!isActive || !isVisible)) {
          onIncomingMessageRef.current?.(frame.conversation_id, frame.message)
        }
        // Sender came online — flip presence. Agent senders have no user id.
        if (typeof frame.message.sender.id === 'number') {
          setPresence(frame.message.sender.id, true)
        }
        break
      }
      case 'message.deleted': {
        deleteMessage(frame.conversation_id, frame.message_id)
        break
      }
      case 'message.reaction': {
        applyReaction(frame.conversation_id, frame.message_id, frame.reactions)
        break
      }
      case 'conversation.typing': {
        setTyping(frame.conversation_id, frame.user_id, frame.is_typing)
        const key = `${frame.conversation_id}:${frame.user_id}`
        const prev = typingTimers.current.get(key)
        if (prev) window.clearTimeout(prev)
        if (frame.is_typing) {
          const t = window.setTimeout(() => {
            useChatStore.getState().setTyping(frame.conversation_id, frame.user_id, false)
            typingTimers.current.delete(key)
          }, TYPING_AUTOCLEAR_MS)
          typingTimers.current.set(key, t)
        } else {
          typingTimers.current.delete(key)
        }
        break
      }
      case 'conversation.read': {
        applyRead(frame.conversation_id, frame.user_id, frame.read_at)
        break
      }
      case 'conversation.cleared': {
        // Fired only to the user who cleared — sync their other tabs/devices.
        clearConversation(frame.conversation_id)
        break
      }
      case 'conversation.deleted': {
        // Fired only to the user who deleted — sync their other tabs/devices.
        removeConversation(frame.conversation_id)
        break
      }
      case 'presence.online': {
        setPresence(frame.user_id, true)
        break
      }
      case 'presence.offline': {
        setPresence(frame.user_id, false)
        break
      }
      case 'agent.status': {
        useChatStore.getState().setAgentStatus(frame.conversation_id, frame.text)
        break
      }
      case 'conversation.subscribed':
      case 'conversation.unsubscribed':
      case 'error':
      default:
        break
    }
    void upsertConversation
  }

  const scheduleReconnect = () => {
    if (closedByUs.current) return
    const attempt = reconnectAttempts.current
    const base = Math.min(MAX_BACKOFF_MS, 1000 * Math.pow(2, Math.min(attempt, 5)))
    const jitter = base * (0.8 + Math.random() * 0.4)
    setSocketStatus('reconnecting')
    if (reconnectTimer.current) window.clearTimeout(reconnectTimer.current)
    reconnectTimer.current = window.setTimeout(() => {
      reconnectAttempts.current = attempt + 1
      connect()
    }, jitter)
  }

  const connect = () => {
    const token = localStorage.getItem('access_token')
    if (!token) {
      setSocketStatus('closed')
      return
    }
    if (socketRef.current && socketRef.current.readyState <= WebSocket.OPEN) {
      try { socketRef.current.close() } catch { /* ignore */ }
    }
    setSocketStatus('connecting')
    const ws = new WebSocket(wsUrl(token))
    socketRef.current = ws

    ws.onopen = () => {
      reconnectAttempts.current = 0
      setSocketStatus('open')
      const { activeConvId } = useChatStore.getState()
      // Only restore the room subscription if the user is actually looking at the
      // tab; otherwise they count as "not actively chatting" and should still get
      // notifications. ChatThread re-subscribes when the tab becomes visible again.
      const tabVisible = typeof document === 'undefined' || document.visibilityState === 'visible'
      if (activeConvId && tabVisible) {
        ws.send(JSON.stringify({ type: 'subscribe', conversation_id: activeConvId } satisfies WsOutbound))
      }
      flushQueue()
    }

    ws.onmessage = (event) => {
      try {
        const frame = JSON.parse(event.data) as WsInbound
        handleInbound(frame)
      } catch {
        // ignore malformed frames
      }
    }

    ws.onerror = () => {
      // onclose will fire next; reconnect logic lives there.
    }

    ws.onclose = () => {
      socketRef.current = null
      if (closedByUs.current) {
        setSocketStatus('closed')
        return
      }
      scheduleReconnect()
    }
  }

  useEffect(() => {
    closedByUs.current = false
    connect()
    return () => {
      closedByUs.current = true
      if (reconnectTimer.current) window.clearTimeout(reconnectTimer.current)
      typingTimers.current.forEach((t) => window.clearTimeout(t))
      typingTimers.current.clear()
      const ws = socketRef.current
      if (ws) {
        try { ws.close() } catch { /* ignore */ }
      }
      socketRef.current = null
      setSocketStatus('closed')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const senders = useMemo<SocketSenders>(
    () => ({
      subscribe: (conversationId) => sendRaw({ type: 'subscribe', conversation_id: conversationId }),
      unsubscribe: (conversationId) => sendRaw({ type: 'unsubscribe', conversation_id: conversationId }),
      sendMessage: (conversationId, content, attachmentIds, replyToId) =>
        sendRaw({ type: 'message', conversation_id: conversationId, content, attachment_ids: attachmentIds, reply_to_id: replyToId ?? null }),
      sendTyping: (conversationId, isTyping) => sendRaw({ type: 'typing', conversation_id: conversationId, is_typing: isTyping }),
      sendRead: (conversationId) => sendRaw({ type: 'read', conversation_id: conversationId }),
    }),
    [],
  )

  return { senders }
}
