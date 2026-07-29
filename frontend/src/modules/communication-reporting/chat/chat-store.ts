import { create } from 'zustand'
import type {
  AgentReference,
  ConversationSummaryResponse,
  MessageResponse,
  PendingMessage,
  ReactionGroup,
  SocketStatus,
  UserReference,
} from './chat-types'

interface ChatState {
  me: UserReference | null

  agents: AgentReference[]
  agentStatusByConvId: Record<string, string | null>

  conversations: Record<string, ConversationSummaryResponse>
  conversationOrder: string[]
  messagesByConvId: Record<string, MessageResponse[]>
  pendingByConvId: Record<string, PendingMessage[]>
  hasMoreByConvId: Record<string, boolean>

  typingByConvId: Record<string, Record<number, true>>
  presenceByUserId: Record<number, boolean>
  readByConvId: Record<string, Record<number, string>>

  drafts: Record<string, string>
  // Message currently being replied to, per conversation (composer quote banner).
  replyTargetByConvId: Record<string, MessageResponse | null>
  activeConvId: string | null
  chatSectionVisible: boolean
  // Conversations currently on screen OUTSIDE the main chat surfaces (e.g. the
  // document reader's chat panel) — suppresses unread counting and toasts for
  // them, independent of the single activeConvId slot.
  visibleConvIds: Record<string, true>
  socketStatus: SocketStatus

  setMe: (u: UserReference | null) => void
  setAgents: (agents: AgentReference[]) => void
  setAgentStatus: (convId: string, text: string | null) => void
  setChatSectionVisible: (v: boolean) => void
  setConvVisible: (convId: string, visible: boolean) => void
  hydrateConversations: (list: ConversationSummaryResponse[]) => void
  upsertConversation: (c: ConversationSummaryResponse) => void
  setActiveConversation: (id: string | null) => void
  appendMessage: (convId: string, msg: MessageResponse, opts?: { isActive?: boolean; isVisible?: boolean }) => void
  prependHistory: (convId: string, msgs: MessageResponse[], hasMore: boolean) => void
  enqueuePending: (p: PendingMessage) => void
  resolvePending: (localId: string, saved: MessageResponse) => void
  failPending: (localId: string) => void
  setTyping: (convId: string, userId: number, isTyping: boolean) => void
  setPresence: (userId: number, online: boolean) => void
  applyRead: (convId: string, userId: number, readAt: string) => void
  setSocketStatus: (s: SocketStatus) => void
  setDraft: (convId: string, value: string) => void
  setReplyTarget: (convId: string, msg: MessageResponse | null) => void
  clearUnread: (convId: string) => void
  deleteMessage: (convId: string, messageId: string) => void
  applyReaction: (convId: string, messageId: string, reactions: ReactionGroup[]) => void
  clearConversation: (convId: string) => void
  removeConversation: (convId: string) => void
  reset: () => void
}

function sortConversationOrder(conversations: Record<string, ConversationSummaryResponse>): string[] {
  return Object.values(conversations)
    .slice()
    .sort((a, b) => {
      const at = a.last_message_at ?? a.updated_at ?? a.created_at
      const bt = b.last_message_at ?? b.updated_at ?? b.created_at
      return new Date(bt).getTime() - new Date(at).getTime()
    })
    .map((c) => c.id)
}

const useChatStore = create<ChatState>((set) => ({
  me: null,

  agents: [],
  agentStatusByConvId: {},

  conversations: {},
  conversationOrder: [],
  messagesByConvId: {},
  pendingByConvId: {},
  hasMoreByConvId: {},

  typingByConvId: {},
  presenceByUserId: {},
  readByConvId: {},

  drafts: {},
  replyTargetByConvId: {},
  activeConvId: null,
  chatSectionVisible: false,
  visibleConvIds: {},
  socketStatus: 'idle',

  setMe: (me) => set({ me }),
  setAgents: (agents) => set({ agents }),
  setAgentStatus: (convId, text) =>
    set((s) => ({ agentStatusByConvId: { ...s.agentStatusByConvId, [convId]: text } })),
  setChatSectionVisible: (v) => set({ chatSectionVisible: v }),
  setConvVisible: (convId, visible) =>
    set((s) => {
      const next = { ...s.visibleConvIds }
      if (visible) next[convId] = true
      else delete next[convId]
      return { visibleConvIds: next }
    }),

  hydrateConversations: (list) =>
    set((s) => {
      const conversations: Record<string, ConversationSummaryResponse> = {}
      // The list endpoint excludes per-document agent chats — keep the ones the
      // reader panel registered so its thread survives the 30s re-hydrate.
      for (const c of Object.values(s.conversations)) {
        if (c.kind === 'agent_doc') conversations[c.id] = c
      }
      const presenceByUserId: Record<number, boolean> = {}
      for (const c of list) {
        conversations[c.id] = c
        for (const p of c.participants) {
          if (typeof p.id === 'number' && typeof p.is_online === 'boolean') presenceByUserId[p.id] = p.is_online
        }
      }
      return {
        conversations,
        conversationOrder: sortConversationOrder(conversations),
        presenceByUserId: { ...presenceByUserId },
      }
    }),

  upsertConversation: (c) =>
    set((s) => {
      const conversations = { ...s.conversations, [c.id]: { ...s.conversations[c.id], ...c } }
      const presenceByUserId = { ...s.presenceByUserId }
      for (const p of c.participants) {
        if (typeof p.id === 'number' && typeof p.is_online === 'boolean') presenceByUserId[p.id] = p.is_online
      }
      return {
        conversations,
        conversationOrder: sortConversationOrder(conversations),
        presenceByUserId,
      }
    }),

  setActiveConversation: (id) => set({ activeConvId: id }),

  appendMessage: (convId, msg, opts) =>
    set((s) => {
      const list = s.messagesByConvId[convId] ?? []
      if (list.some((m) => m.id === msg.id)) return s
      const messagesByConvId = { ...s.messagesByConvId, [convId]: [...list, msg] }

      const conv = s.conversations[convId]
      const conversations = { ...s.conversations }
      if (conv) {
        const isFromMe = msg.is_mine
        const shouldIncrementUnread =
          !isFromMe && (!opts?.isActive || !opts?.isVisible)
        conversations[convId] = {
          ...conv,
          last_message: msg,
          last_message_at: msg.created_at,
          updated_at: msg.created_at,
          unread_count: shouldIncrementUnread ? (conv.unread_count ?? 0) + 1 : conv.unread_count,
        }
      }

      return {
        messagesByConvId,
        conversations,
        conversationOrder: sortConversationOrder(conversations),
        // A landed message ends any agent progress line for this thread.
        agentStatusByConvId: { ...s.agentStatusByConvId, [convId]: null },
      }
    }),

  prependHistory: (convId, msgs, hasMore) =>
    set((s) => {
      const existing = s.messagesByConvId[convId] ?? []
      const known = new Set(existing.map((m) => m.id))
      const incoming = msgs.filter((m) => !known.has(m.id))
      return {
        messagesByConvId: { ...s.messagesByConvId, [convId]: [...incoming, ...existing] },
        hasMoreByConvId: { ...s.hasMoreByConvId, [convId]: hasMore },
      }
    }),

  enqueuePending: (p) =>
    set((s) => ({
      pendingByConvId: {
        ...s.pendingByConvId,
        [p.conversationId]: [...(s.pendingByConvId[p.conversationId] ?? []), p],
      },
    })),

  resolvePending: (localId, saved) =>
    set((s) => {
      const convId = saved.conversation_id
      const pendingList = (s.pendingByConvId[convId] ?? []).filter((p) => p.localId !== localId)
      const existingMessages = s.messagesByConvId[convId] ?? []
      const alreadyHas = existingMessages.some((m) => m.id === saved.id)
      const messages = alreadyHas ? existingMessages : [...existingMessages, saved]
      const conv = s.conversations[convId]
      const conversations = conv
        ? {
            ...s.conversations,
            [convId]: {
              ...conv,
              last_message: saved,
              last_message_at: saved.created_at,
              updated_at: saved.created_at,
            },
          }
        : s.conversations
      return {
        pendingByConvId: { ...s.pendingByConvId, [convId]: pendingList },
        messagesByConvId: { ...s.messagesByConvId, [convId]: messages },
        conversations,
        conversationOrder: sortConversationOrder(conversations),
      }
    }),

  failPending: (localId) =>
    set((s) => {
      const next: Record<string, PendingMessage[]> = {}
      for (const [convId, list] of Object.entries(s.pendingByConvId)) {
        next[convId] = list.map((p) =>
          p.localId === localId ? { ...p, status: 'failed' as const } : p,
        )
      }
      return { pendingByConvId: next }
    }),

  setTyping: (convId, userId, isTyping) =>
    set((s) => {
      const cur = { ...(s.typingByConvId[convId] ?? {}) }
      if (isTyping) {
        cur[userId] = true
      } else {
        delete cur[userId]
      }
      return { typingByConvId: { ...s.typingByConvId, [convId]: cur } }
    }),

  setPresence: (userId, online) =>
    set((s) => ({
      presenceByUserId: { ...s.presenceByUserId, [userId]: online },
    })),

  applyRead: (convId, userId, readAt) =>
    set((s) => {
      const convReads = { ...(s.readByConvId[convId] ?? {}), [userId]: readAt }
      const readByConvId = { ...s.readByConvId, [convId]: convReads }
      const isMe = s.me?.id === userId
      const conv = s.conversations[convId]
      const conversations =
        isMe && conv
          ? { ...s.conversations, [convId]: { ...conv, unread_count: 0 } }
          : s.conversations
      return { readByConvId, conversations }
    }),

  setSocketStatus: (socketStatus) => set({ socketStatus }),

  setDraft: (convId, value) =>
    set((s) => ({ drafts: { ...s.drafts, [convId]: value } })),

  setReplyTarget: (convId, msg) =>
    set((s) => ({ replyTargetByConvId: { ...s.replyTargetByConvId, [convId]: msg } })),

  clearUnread: (convId) =>
    set((s) => {
      const conv = s.conversations[convId]
      if (!conv) return s
      return {
        conversations: { ...s.conversations, [convId]: { ...conv, unread_count: 0 } },
      }
    }),

  deleteMessage: (convId, messageId) =>
    set((s) => {
      const msgs = s.messagesByConvId[convId] ?? []
      const msg = msgs.find((m) => m.id === messageId)
      if (!msg) return s

      const updated = {
        ...msg,
        content: '[message deleted]',
        attachments: [],
      }
      const messagesByConvId = {
        ...s.messagesByConvId,
        [convId]: msgs.map((m) => {
          if (m.id === messageId) return updated
          // Quotes of the deleted message go blank too, matching the server.
          if (m.reply_to?.id === messageId) {
            return {
              ...m,
              reply_to: { ...m.reply_to, content: '[message deleted]', is_deleted: true, has_attachments: false },
            }
          }
          return m
        }),
      }

      const conv = s.conversations[convId]
      const conversations = conv && conv.last_message?.id === messageId
        ? {
            ...s.conversations,
            [convId]: {
              ...conv,
              last_message: undefined as unknown as MessageResponse,
              last_message_at: undefined,
            },
          }
        : s.conversations

      return { messagesByConvId, conversations }
    }),

  applyReaction: (convId, messageId, reactions) =>
    set((s) => {
      const msgs = s.messagesByConvId[convId]
      if (!msgs || !msgs.some((m) => m.id === messageId)) return s
      return {
        messagesByConvId: {
          ...s.messagesByConvId,
          [convId]: msgs.map((m) => (m.id === messageId ? { ...m, reactions } : m)),
        },
      }
    }),

  clearConversation: (convId) =>
    set((s) => {
      const conv = s.conversations[convId]
      const conversations = conv
        ? {
            ...s.conversations,
            [convId]: {
              ...conv,
              last_message: undefined as unknown as MessageResponse,
              unread_count: 0,
            },
          }
        : s.conversations
      return {
        messagesByConvId: { ...s.messagesByConvId, [convId]: [] },
        pendingByConvId: { ...s.pendingByConvId, [convId]: [] },
        hasMoreByConvId: { ...s.hasMoreByConvId, [convId]: false },
        replyTargetByConvId: { ...s.replyTargetByConvId, [convId]: null },
        conversations,
      }
    }),

  removeConversation: (convId) =>
    set((s) => {
      const omit = <T,>(rec: Record<string, T>): Record<string, T> => {
        if (!(convId in rec)) return rec
        const next = { ...rec }
        delete next[convId]
        return next
      }
      const conversations = omit(s.conversations)
      return {
        conversations,
        conversationOrder: sortConversationOrder(conversations),
        messagesByConvId: omit(s.messagesByConvId),
        pendingByConvId: omit(s.pendingByConvId),
        hasMoreByConvId: omit(s.hasMoreByConvId),
        typingByConvId: omit(s.typingByConvId),
        readByConvId: omit(s.readByConvId),
        drafts: omit(s.drafts),
        replyTargetByConvId: omit(s.replyTargetByConvId),
        agentStatusByConvId: omit(s.agentStatusByConvId),
        activeConvId: s.activeConvId === convId ? null : s.activeConvId,
      }
    }),

  reset: () =>
    set({
      me: null,
      agents: [],
      agentStatusByConvId: {},
      conversations: {},
      conversationOrder: [],
      messagesByConvId: {},
      pendingByConvId: {},
      hasMoreByConvId: {},
      typingByConvId: {},
      presenceByUserId: {},
      readByConvId: {},
      drafts: {},
      replyTargetByConvId: {},
      activeConvId: null,
      chatSectionVisible: false,
      visibleConvIds: {},
      socketStatus: 'idle',
    }),
}))

// Per-document chats live in the reader panel; they never count toward the
// main chat badge.
export const selectTotalUnread = (s: ChatState): number =>
  Object.values(s.conversations).reduce(
    (n, c) => (c.kind === 'agent_doc' ? n : n + (c.unread_count ?? 0)),
    0,
  )

export default useChatStore
