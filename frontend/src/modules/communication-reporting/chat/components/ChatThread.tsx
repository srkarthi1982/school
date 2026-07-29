import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import useChatStore from '../chat-store'
import { generateId } from '../../../../infra/shared/utils/uid'
import { getMessages, sendMessageRest, deleteMessage, clearConversation, setReaction } from '../chat-api'
import { useI18n } from '../../../../infra/locales/I18nContext'
import { confirmDialog } from '../../../../infra/shared/store/useConfirmStore'
import { useChatSenders } from '../ChatSocketContext'
import useMarkReadOnOpen from '../hooks/useMarkReadOnOpen'
import ChatThreadHeader from './ChatThreadHeader'
import MessageList from './MessageList'
import ChatComposer from './ChatComposer'
import TypingIndicator from './TypingIndicator'
import EmptyChatState from './EmptyChatState'
import type {
  ConversationSummaryResponse,
  MessageResponse,
  PendingMessage,
  RepliedMessagePreview,
} from '../chat-types'

// Preview the composer/pending bubble shows for the message being replied to,
// mirroring what the backend embeds as reply_to on the saved message.
function toReplyPreview(m: MessageResponse): RepliedMessagePreview {
  return {
    id: m.id,
    sender: m.sender,
    content: m.content.slice(0, 200),
    is_deleted: false,
    has_attachments: (m.attachments?.length ?? 0) > 0,
  }
}

const EMPTY_MESSAGES: MessageResponse[] = []
const EMPTY_PENDING: PendingMessage[] = []
const EMPTY_TYPING: Record<number, true> = {}

interface Props {
  emptyTitle: string
  emptyHint: string
  composerPlaceholder: string
  sendLabel: string
  onlineLabel: string
  offlineLabel: string
  typingLabel: string
  todayLabel: string
  yesterdayLabel: string
  // Render a specific conversation instead of the globally active one — used
  // by the document reader's chat panel so it never fights with the ChatWidget
  // over activeConvId.
  conversationId?: string
  // Summary to render when the conversation is absent from the hydrated list
  // (agent_doc conversations are excluded from GET /chat/conversations).
  conversationFallback?: ConversationSummaryResponse | null
  hideHeader?: boolean
}

export default function ChatThread({
  emptyTitle,
  emptyHint,
  composerPlaceholder,
  sendLabel,
  onlineLabel,
  offlineLabel,
  typingLabel,
  todayLabel,
  yesterdayLabel,
  conversationId,
  conversationFallback = null,
  hideHeader = false,
}: Props) {
  const senders = useChatSenders()
  const { t } = useI18n()
  const storeActiveConvId = useChatStore((s) => s.activeConvId)
  const activeConvId = conversationId ?? storeActiveConvId
  const {
    me,
    conversation: conversationFromStore,
    messages,
    pending,
    typing,
    presenceByUserId,
    readByConvId,
    hasMore,
    agentStatus,
    replyTarget,
  } = useChatStore(
    useShallow((s) => ({
      me: s.me,
      conversation: activeConvId ? s.conversations[activeConvId] ?? null : null,
      messages: activeConvId ? s.messagesByConvId[activeConvId] ?? EMPTY_MESSAGES : EMPTY_MESSAGES,
      pending: activeConvId ? s.pendingByConvId[activeConvId] ?? EMPTY_PENDING : EMPTY_PENDING,
      typing: activeConvId ? s.typingByConvId[activeConvId] ?? EMPTY_TYPING : EMPTY_TYPING,
      presenceByUserId: s.presenceByUserId,
      readByConvId: s.readByConvId,
      hasMore: activeConvId ? s.hasMoreByConvId[activeConvId] ?? false : false,
      agentStatus: activeConvId ? s.agentStatusByConvId[activeConvId] ?? null : null,
      replyTarget: activeConvId ? s.replyTargetByConvId[activeConvId] ?? null : null,
    })),
  )
  const conversation = conversationFromStore ?? conversationFallback

  const lastFetchedConvRef = useRef<string | null>(null)

  // Whether this browser tab is currently visible. When the user switches to
  // another tab/app, they are no longer "actively chatting", so we release the
  // room subscription to let notifications through again.
  const [tabVisible, setTabVisible] = useState(
    typeof document === 'undefined' || document.visibilityState === 'visible',
  )
  useEffect(() => {
    const onVisibility = () => setTabVisible(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  // Subscribe to the active conversation only while it is genuinely being viewed
  // (thread mounted + tab visible). The cleanup runs on conversation change, tab
  // hide, AND unmount — and because React runs child cleanups before the parent's,
  // this unsubscribe is sent while the chat socket is still open, so the server
  // reliably drops us from the room the moment we leave. That in turn re-enables
  // "new message" notifications (see is_user_in_room on the backend).
  useEffect(() => {
    if (!activeConvId || !tabVisible) return
    senders.subscribe(activeConvId)
    return () => senders.unsubscribe(activeConvId)
  }, [activeConvId, tabVisible, senders])

  useEffect(() => {
    if (!activeConvId) return
    if (lastFetchedConvRef.current === activeConvId) return
    if ((useChatStore.getState().messagesByConvId[activeConvId] ?? []).length > 0) {
      lastFetchedConvRef.current = activeConvId
      return
    }
    lastFetchedConvRef.current = activeConvId
    void (async () => {
      try {
        const res = await getMessages(activeConvId, 50, 0)
        useChatStore
          .getState()
          .prependHistory(activeConvId, res.items, res.total > res.items.length)
      } catch {
        // ignore
      }
    })()
  }, [activeConvId])

  useMarkReadOnOpen(activeConvId, senders, messages.length)

  const rawOtherId = conversation?.participants[0]?.id
  const otherUserId = typeof rawOtherId === 'number' ? rawOtherId : undefined
  const otherReadAt =
    activeConvId && otherUserId !== undefined
      ? readByConvId[activeConvId]?.[otherUserId]
      : undefined

  const handleSend = useCallback(
    (content: string, attachmentIds: string[]) => {
      if (!activeConvId) return
      const localId = generateId()
      const state = useChatStore.getState()
      const target = state.replyTargetByConvId[activeConvId] ?? null
      state.enqueuePending({
        localId,
        conversationId: activeConvId,
        content,
        attachmentIds,
        createdAt: new Date().toISOString(),
        status: 'pending',
        replyToId: target?.id,
        replyTo: target ? toReplyPreview(target) : null,
      })
      state.setReplyTarget(activeConvId, null)
      void sendMessageRest(activeConvId, content, attachmentIds, target?.id)
        .then((saved) => useChatStore.getState().resolvePending(localId, saved))
        .catch(() => useChatStore.getState().failPending(localId))
    },
    [activeConvId],
  )

  const handleRetry = useCallback(
    (localId: string, content: string, attachmentIds: string[]) => {
      if (!activeConvId) return
      const state = useChatStore.getState()
      // Recover the reply reference from the failed pending entry, if any.
      const prev = (state.pendingByConvId[activeConvId] ?? []).find((p) => p.localId === localId)
      state.enqueuePending({
        localId,
        conversationId: activeConvId,
        content,
        attachmentIds,
        createdAt: new Date().toISOString(),
        status: 'pending',
        replyToId: prev?.replyToId,
        replyTo: prev?.replyTo ?? null,
      })
      void sendMessageRest(activeConvId, content, attachmentIds, prev?.replyToId)
        .then((saved) => useChatStore.getState().resolvePending(localId, saved))
        .catch(() => useChatStore.getState().failPending(localId))
    },
    [activeConvId],
  )

  const handleLoadOlder = useCallback(() => {
    if (!activeConvId) return
    const existing = useChatStore.getState().messagesByConvId[activeConvId] ?? []
    void getMessages(activeConvId, 50, existing.length)
      .then((res) =>
        useChatStore
          .getState()
          .prependHistory(activeConvId, res.items, res.total > existing.length + res.items.length),
      )
      .catch(() => { /* ignore */ })
  }, [activeConvId])

  const handleDelete = useCallback(
    (messageId: string) => {
      if (!activeConvId) return
      void deleteMessage(activeConvId, messageId)
        .then(() => {
          useChatStore.getState().deleteMessage(activeConvId, messageId)
        })
        .catch(() => { /* ignore */ })
    },
    [activeConvId],
  )

  const handleReact = useCallback(
    (messageId: string, emoji: string) => {
      if (!activeConvId) return
      const convId = activeConvId
      // The server echoes personalized reactions over the socket (message.reaction),
      // which updates the store; also apply the returned message here so the
      // reacting tab reflects it immediately even if the socket frame is delayed.
      void setReaction(convId, messageId, emoji)
        .then((saved) => {
          useChatStore.getState().applyReaction(convId, messageId, saved.reactions ?? [])
        })
        .catch(() => { /* ignore */ })
    },
    [activeConvId],
  )

  const handleClearChat = useCallback(() => {
    if (!activeConvId) return
    const convId = activeConvId
    void (async () => {
      const ok = await confirmDialog({
        title: t('chat.clearChatConfirmTitle'),
        message: t('chat.clearChatConfirmMessage'),
        confirmLabel: t('chat.clearChatConfirm'),
        cancelLabel: t('chat.cancel'),
        tone: 'danger',
      })
      if (!ok) return
      try {
        await clearConversation(convId)
        useChatStore.getState().clearConversation(convId)
      } catch {
        // ignore
      }
    })()
  }, [activeConvId, t])

  const someoneTyping = useMemo(() => {
    return Object.keys(typing).some((uid) => Number(uid) !== me?.id)
  }, [typing, me?.id])

  if (!activeConvId || !conversation) {
    return (
      <div className="card flex-1 min-h-0 overflow-hidden flex items-center justify-center">
        <EmptyChatState variant="thread" title={emptyTitle} hint={emptyHint} />
      </div>
    )
  }

  return (
    <div className="card flex-1 min-h-0 overflow-hidden flex flex-col">
      {!hideHeader && (
        <ChatThreadHeader
          conversation={conversation}
          presenceByUserId={presenceByUserId}
          onlineLabel={onlineLabel}
          offlineLabel={offlineLabel}
          clearChatLabel={t('chat.clearChat')}
          onClearChat={handleClearChat}
        />
      )}
      <MessageList
        messages={messages}
        pending={pending}
        myUserId={me?.id ?? undefined}
        otherUserId={otherUserId}
        otherReadAt={otherReadAt}
        hasMore={hasMore}
        onLoadOlder={handleLoadOlder}
        onRetry={handleRetry}
        onDelete={handleDelete}
        onReply={(m) => useChatStore.getState().setReplyTarget(activeConvId, m)}
        onReact={handleReact}
        replyLabel={t('chat.reply')}
        reactLabel={t('chat.react')}
        attachmentLabel={t('chat.attachment')}
        todayLabel={todayLabel}
        yesterdayLabel={yesterdayLabel}
      />
      {someoneTyping && <TypingIndicator label={typingLabel} />}
      {agentStatus && <TypingIndicator label={agentStatus} />}
      <ChatComposer
        conversationId={activeConvId}
        onSend={handleSend}
        placeholder={composerPlaceholder}
        sendLabel={sendLabel}
        replyTarget={replyTarget}
        onCancelReply={() => useChatStore.getState().setReplyTarget(activeConvId, null)}
        replyingToLabel={t('chat.replyingTo')}
        attachmentLabel={t('chat.attachment')}
      />
    </div>
  )
}
