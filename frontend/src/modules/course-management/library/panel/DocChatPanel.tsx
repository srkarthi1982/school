/**
 * DocChatPanel — chat with the AI agent (AskMAI) about THE document currently
 * open in the reader. Docked in the same slot as the other reader tool panels
 * (left of <ReaderToolsAside/>), expandable to full screen.
 *
 * The conversation is a per-document agent chat (kind 'agent_doc'): the
 * backend scopes the agent's RAG search to this one document, and the
 * conversation is kept out of the main chat list. It reuses the global chat
 * runtime (store + WebSocket via ChatRuntimeProvider) and renders the shared
 * <ChatThread/> pinned to its own conversation id, so it never fights with
 * the floating ChatWidget over the active conversation.
 */
import { useEffect, useState } from 'react'
import {
    HiOutlineArrowsPointingIn,
    HiOutlineArrowsPointingOut,
    HiOutlineXMark,
} from 'react-icons/hi2'
import { useI18n } from '../../../../infra/locales/I18nContext'
import useChatStore from '../../../communication-reporting/chat/chat-store'
import { createOrGetAgentConversation } from '../../../communication-reporting/chat/chat-api'
import { useChatSenders } from '../../../communication-reporting/chat/ChatSocketContext'
import ChatThread from '../../../communication-reporting/chat/components/ChatThread'
import type { ConversationSummaryResponse } from '../../../communication-reporting/chat/chat-types'
import { useReaderContext } from './ReaderContext'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Map the reader's materialId to the create-conversation document payload:
 * numeric = library material id; UUID = lesson material file id. */
export function docChatTarget(
    materialId: string,
): { libraryMaterialId?: number; materialFileId?: string } | null {
    if (/^\d+$/.test(materialId)) return { libraryMaterialId: Number(materialId) }
    if (UUID_RE.test(materialId)) return { materialFileId: materialId }
    return null
}

export function DocChatPanel({ onClose }: { onClose?: () => void }) {
    const { t } = useI18n()
    const { materialId } = useReaderContext()
    const senders = useChatSenders()
    const agents = useChatStore((s) => s.agents)
    const socketStatus = useChatStore((s) => s.socketStatus)
    const agent = agents.find((a) => a.slug === 'askmai') ?? agents[0]

    const [convId, setConvId] = useState<string | null>(null)
    const [fallback, setFallback] = useState<ConversationSummaryResponse | null>(null)
    const [error, setError] = useState(false)
    const [fullscreen, setFullscreen] = useState(false)

    useEffect(() => {
        const target = docChatTarget(materialId)
        if (!agent || !target) return
        let cancelled = false
        setError(false)
        void createOrGetAgentConversation(agent.id, target)
            .then((detail) => {
                if (cancelled) return
                const summary = {
                    ...detail,
                    participants: detail.participants ?? [],
                    unread_count: 0,
                    last_message: null,
                } as unknown as ConversationSummaryResponse
                useChatStore.getState().upsertConversation(summary)
                setFallback(summary)
                setConvId(detail.id)
            })
            .catch(() => {
                if (!cancelled) setError(true)
            })
        return () => {
            cancelled = true
        }
    }, [agent, materialId])

    // While the panel is on screen its conversation counts as "visible": no
    // unread bumps, no toasts. ChatThread handles the room subscribe itself.
    useEffect(() => {
        if (!convId) return
        useChatStore.getState().setConvVisible(convId, true)
        return () => useChatStore.getState().setConvVisible(convId, false)
    }, [convId])

    // The socket-level restore only re-subscribes the global active
    // conversation — re-join this room ourselves after a reconnect.
    useEffect(() => {
        if (socketStatus === 'open' && convId) senders.subscribe(convId)
    }, [socketStatus, convId, senders])

    const containerCls = fullscreen
        ? 'fixed inset-0 z-40 bg-surface flex flex-col'
        : 'w-[400px] max-w-[45vw] shrink-0 border-l border-bd bg-surface flex flex-col'

    return (
        <div className={containerCls}>
            <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-bd shrink-0">
                <span className="text-sm font-semibold text-primary truncate">
                    {t('library.docChat')}
                </span>
                <div className="flex items-center gap-1 shrink-0">
                    <button
                        onClick={() => setFullscreen((f) => !f)}
                        className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-primary hover:bg-surface-2"
                        aria-label={fullscreen ? 'exit fullscreen' : 'fullscreen'}
                    >
                        {fullscreen ? (
                            <HiOutlineArrowsPointingIn className="text-[18px]" />
                        ) : (
                            <HiOutlineArrowsPointingOut className="text-[18px]" />
                        )}
                    </button>
                    {onClose && (
                        <button
                            onClick={onClose}
                            className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-primary hover:bg-surface-2"
                            aria-label="close"
                        >
                            <HiOutlineXMark className="text-[18px]" />
                        </button>
                    )}
                </div>
            </div>

            {error ? (
                <div className="flex-1 flex items-center justify-center p-6 text-sm text-secondary text-center">
                    {t('library.docChatUnavailable')}
                </div>
            ) : !convId ? (
                <div className="flex-1 flex items-center justify-center p-6 text-sm text-secondary">
                    …
                </div>
            ) : (
                <ChatThread
                    conversationId={convId}
                    conversationFallback={fallback}
                    emptyTitle={t('chat.emptyThreadTitle')}
                    emptyHint={t('chat.emptyThreadHint')}
                    composerPlaceholder={t('chat.composerPlaceholder')}
                    sendLabel={t('chat.send')}
                    onlineLabel={t('chat.online')}
                    offlineLabel={t('chat.offline')}
                    typingLabel={t('chat.typing')}
                    todayLabel={t('chat.today')}
                    yesterdayLabel={t('chat.yesterday')}
                />
            )}
        </div>
    )
}
