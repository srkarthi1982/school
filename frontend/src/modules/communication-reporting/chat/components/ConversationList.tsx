import { useEffect, useState } from 'react'
import { HiOutlinePlus } from 'react-icons/hi2'
import { useShallow } from 'zustand/react/shallow'
import { batchFetchPhotos, createOrGetAgentConversation, deleteConversation } from '../chat-api'
import useChatStore from '../chat-store'
import { useI18n } from '../../../../infra/locales/I18nContext'
import { confirmDialog } from '../../../../infra/shared/store/useConfirmStore'
import type { AgentReference, ConversationSummaryResponse } from '../chat-types'
import Avatar from './Avatar'
import ConversationItem from './ConversationItem'
import EmptyChatState from './EmptyChatState'

interface Props {
  onNewChat: () => void
  onSelect: (conversationId: string) => void
}

export default function ConversationList({ onNewChat, onSelect }: Props) {
  const { t } = useI18n()
  const { conversations, conversationOrder, activeConvId, presenceByUserId, agents } = useChatStore(
    useShallow((s) => ({
      conversations: s.conversations,
      conversationOrder: s.conversationOrder,
      activeConvId: s.activeConvId,
      presenceByUserId: s.presenceByUserId,
      agents: s.agents,
    })),
  )
  const [openingAgentId, setOpeningAgentId] = useState<string | null>(null)

  useEffect(() => {
    const userIds = new Set<number>()
    for (const id of conversationOrder) {
      const conv = conversations[id]
      if (!conv) continue
      if (conv.kind === 'agent') continue
      for (const p of conv.participants) {
        const uid = typeof p.id === 'number' ? p.id : null
        if (uid) userIds.add(uid)
      }
    }
    if (userIds.size > 0) {
      batchFetchPhotos([...userIds])
    }
  }, [conversations, conversationOrder])

  // Agent conversations render pinned at the top; keep them out of the
  // regular (recency-sorted) list so they don't appear twice. Per-document
  // agent chats (kind 'agent_doc') belong to the reader panel — never listed.
  const agentConvByAgentId: Record<string, ConversationSummaryResponse> = {}
  for (const id of conversationOrder) {
    const conv = conversations[id]
    if (conv?.kind === 'agent' && conv.agent) agentConvByAgentId[conv.agent.id] = conv
  }
  const regularOrder = conversationOrder.filter((id) => {
    const kind = conversations[id]?.kind
    return kind !== 'agent' && kind !== 'agent_doc'
  })

  const handleDelete = async (conversationId: string) => {
    const ok = await confirmDialog({
      title: t('chat.deleteConversationConfirmTitle'),
      message: t('chat.deleteConversationConfirmMessage'),
      confirmLabel: t('chat.deleteConversationConfirm'),
      cancelLabel: t('chat.cancel'),
      tone: 'danger',
    })
    if (!ok) return
    try {
      await deleteConversation(conversationId)
      useChatStore.getState().removeConversation(conversationId)
    } catch {
      // ignore — user can retry
    }
  }

  const handleAgentClick = async (agent: AgentReference) => {
    const existing = agentConvByAgentId[agent.id]
    if (existing) {
      onSelect(existing.id)
      return
    }
    if (openingAgentId) return
    setOpeningAgentId(agent.id)
    try {
      const detail = await createOrGetAgentConversation(agent.id)
      useChatStore.getState().upsertConversation({
        ...detail,
        participants: [],
        unread_count: 0,
        last_message: null,
      })
      onSelect(detail.id)
    } catch {
      // ignore — user can retry
    } finally {
      setOpeningAgentId(null)
    }
  }

  return (
    <div className="card p-0 overflow-hidden flex flex-col h-full">
      <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-bold text-muted tracking-[0.07em] uppercase mb-0.5">
            Messages
          </p>
          <p className="text-[12px] text-secondary">
            {conversationOrder.length} conversation{conversationOrder.length === 1 ? '' : 's'}
          </p>
        </div>
        <button
          type="button"
          onClick={onNewChat}
          className="inline-flex items-center justify-center w-8 h-8 rounded-[9px] text-white cursor-pointer transition-colors"
          style={{ background: 'var(--accent)' }}
          aria-label="New conversation"
        >
          <HiOutlinePlus className="text-[16px]" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto thin-scrollbar-light">
        {agents.map((agent) => {
          const conv = agentConvByAgentId[agent.id]
          if (conv) {
            // Agent conversations can't be deleted, only cleared (from the
            // thread header) — so no hover delete button here.
            return (
              <ConversationItem
                key={`agent-${agent.id}`}
                conversation={conv}
                isActive={activeConvId === conv.id}
                isFirst
                presenceByUserId={presenceByUserId}
                onClick={() => onSelect(conv.id)}
              />
            )
          }
          return (
            <button
              key={`agent-${agent.id}`}
              type="button"
              onClick={() => void handleAgentClick(agent)}
              disabled={openingAgentId !== null}
              className="flex items-start gap-3 px-4 py-3 cursor-pointer w-full text-start transition-colors hover:bg-[var(--surface-2)] disabled:opacity-60"
            >
              <Avatar userId={null} name={agent.display_name} isAgent size={38} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="text-[13.5px] text-primary truncate font-medium">
                    {agent.display_name}
                  </p>
                  <span
                    className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full text-white shrink-0"
                    style={{ background: 'var(--accent)' }}
                  >
                    AI
                  </span>
                </div>
                <p className="text-[12.5px] truncate text-muted">
                  {agent.description || 'Ask me anything about the system'}
                </p>
              </div>
            </button>
          )
        })}
        {regularOrder.length === 0 && agents.length === 0 ? (
          <EmptyChatState
            variant="list"
            title="No conversations yet"
            hint="Tap the + button to start a new chat"
          />
        ) : (
          <div className="flex flex-col">
            {regularOrder.map((id, i) => {
              const conv = conversations[id]
              if (!conv) return null
              return (
                <ConversationItem
                  key={id}
                  conversation={conv}
                  isActive={activeConvId === id}
                  isFirst={i === 0 && agents.length === 0}
                  presenceByUserId={presenceByUserId}
                  onClick={() => onSelect(id)}
                  onDelete={() => void handleDelete(id)}
                  deleteLabel={t('chat.deleteConversation')}
                />
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
