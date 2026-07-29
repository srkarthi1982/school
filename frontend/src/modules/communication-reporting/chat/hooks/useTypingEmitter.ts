import { useCallback, useEffect, useRef } from 'react'
import type { SocketSenders } from '../chat-types'

const STOP_DEBOUNCE_MS = 2000

export default function useTypingEmitter(
  conversationId: string | null,
  senders: SocketSenders,
) {
  const wasTypingRef = useRef(false)
  const timerRef = useRef<number | null>(null)

  const emit = useCallback(
    (value: string) => {
      if (!conversationId) return
      if (value.length > 0 && !wasTypingRef.current) {
        senders.sendTyping(conversationId, true)
        wasTypingRef.current = true
      }
      if (timerRef.current) window.clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(() => {
        if (wasTypingRef.current && conversationId) {
          senders.sendTyping(conversationId, false)
          wasTypingRef.current = false
        }
      }, STOP_DEBOUNCE_MS)
    },
    [conversationId, senders],
  )

  const flushOff = useCallback(() => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
    if (wasTypingRef.current && conversationId) {
      senders.sendTyping(conversationId, false)
      wasTypingRef.current = false
    }
  }, [conversationId, senders])

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current)
    }
  }, [])

  return { emit, flushOff }
}
