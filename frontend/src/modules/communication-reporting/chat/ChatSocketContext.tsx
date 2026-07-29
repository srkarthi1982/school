import { createContext, useContext } from 'react'
import type { SocketSenders } from './chat-types'

const noop = () => { /* no-op default */ }

const defaultSenders: SocketSenders = {
  subscribe: noop,
  unsubscribe: noop,
  sendMessage: noop,
  sendTyping: noop,
  sendRead: noop,
}

export const ChatSocketContext = createContext<SocketSenders>(defaultSenders)

export function useChatSenders(): SocketSenders {
  return useContext(ChatSocketContext)
}
