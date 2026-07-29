import { useEffect } from 'react'
import useChatStore from '../chat-store'
import { chatMe, getAgents, getConversations } from '../chat-api'

const REFRESH_MS = 30_000

export default function useChatBootstrap() {
  useEffect(() => {
    let cancelled = false

    void (async () => {
      try {
        const me = await chatMe()
        if (cancelled) return
        useChatStore.getState().setMe(me)
      } catch {
        // swallow — connection.ready frame will set me as a fallback
      }

      try {
        const list = await getConversations()
        if (cancelled) return
        useChatStore.getState().hydrateConversations(list)
      } catch {
        // ignore — UI will show empty state
      }

      try {
        const agents = await getAgents()
        if (cancelled) return
        useChatStore.getState().setAgents(agents)
      } catch {
        // ignore — the pinned AI entry simply won't render
      }
    })()

    const interval = window.setInterval(async () => {
      try {
        const list = await getConversations()
        useChatStore.getState().hydrateConversations(list)
      } catch {
        // ignore polling errors
      }
    }, REFRESH_MS)

    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [])
}
