import type {
  MessageResponse,
  ConversationSummaryResponse,
  AgentReference,
  RepliedMessagePreview,
  ReactionGroup,
  AppModulesChatCommonSchemasUserReference as BaseUserReference,
} from '../../../api/generated'

export type UserReference = BaseUserReference & { avatar_url?: string | null }

export type SocketStatus =
  | 'idle'
  | 'connecting'
  | 'open'
  | 'reconnecting'
  | 'closed'

export interface PendingMessage {
  localId: string
  conversationId: string
  content: string
  attachmentIds: string[]
  createdAt: string
  status: 'pending' | 'failed'
  replyToId?: string
  // Preview of the quoted message so the optimistic bubble renders the quote
  // before the server echo arrives.
  replyTo?: RepliedMessagePreview | null
}

export type WsInbound =
  | { type: 'connection.ready'; user_id: number; roles: string[]; username?: string; full_name?: string; display_name?: string }
  | { type: 'conversation.subscribed'; conversation_id: string }
  | { type: 'conversation.unsubscribed'; conversation_id: string }
  | { type: 'message.created'; conversation_id: string; message: MessageResponse }
  | { type: 'message.deleted'; conversation_id: string; message_id: string; deleted_at: string }
  | { type: 'message.reaction'; conversation_id: string; message_id: string; reactions: ReactionGroup[] }
  | { type: 'conversation.typing'; conversation_id: string; user_id: number; is_typing: boolean }
  | { type: 'conversation.read'; conversation_id: string; user_id: number; read_at: string }
  | { type: 'conversation.cleared'; conversation_id: string; cleared_at: string }
  | { type: 'conversation.deleted'; conversation_id: string; deleted_at: string }
  | { type: 'presence.online'; user_id: number }
  | { type: 'presence.offline'; user_id: number }
  // Ephemeral progress while an AI agent works on a reply ("Checking your
  // schedule…"); text null clears it. Cleared implicitly by message.created.
  | { type: 'agent.status'; conversation_id: string; text: string | null }
  | { type: 'error'; detail: string }

export type WsOutbound =
  | { type: 'subscribe'; conversation_id: string }
  | { type: 'unsubscribe'; conversation_id: string }
  | { type: 'message'; conversation_id: string; content: string; attachment_ids: string[]; reply_to_id?: string | null }
  | { type: 'typing'; conversation_id: string; is_typing: boolean }
  | { type: 'read'; conversation_id: string }

export interface SocketSenders {
  subscribe: (conversationId: string) => void
  unsubscribe: (conversationId: string) => void
  sendMessage: (conversationId: string, content: string, attachmentIds: string[], replyToId?: string) => void
  sendTyping: (conversationId: string, isTyping: boolean) => void
  sendRead: (conversationId: string) => void
}

export type { MessageResponse, ConversationSummaryResponse, AgentReference, RepliedMessagePreview, ReactionGroup }
