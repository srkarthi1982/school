import { useEffect, useMemo, useRef, useState } from 'react'
import { HiOutlineXMark, HiOutlineMagnifyingGlass } from 'react-icons/hi2'
import useAuthStore, { selectUserPermissions } from '../../../../infra/auth/useAuthStore'
import { createOrGetAgentConversation, createOrGetDirectConversation, loadDirectoryFor } from '../chat-api'
import useChatStore from '../chat-store'
import Avatar from './Avatar'
import type { AgentReference, UserReference, ConversationSummaryResponse } from '../chat-types'
import { canAccess } from '../../../../infra/shared/utils/menuUtils'

interface Props {
  open: boolean
  onClose: () => void
  onConversationOpened: (conversationId: string) => void
  title: string
  searchPlaceholder: string
  unavailableLabel: string
}

const SEARCH_DEBOUNCE_MS = 250

export default function NewChatModal({
  open,
  onClose,
  onConversationOpened,
  title,
  searchPlaceholder,
  unavailableLabel,
}: Props) {
  const permissions = useAuthStore(selectUserPermissions)
  const agents = useChatStore((s) => s.agents)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<UserReference[]>([])
  const [loading, setLoading] = useState(false)
  const [creatingFor, setCreatingFor] = useState<number | string | null>(null)
  const debRef = useRef<number | null>(null)

  const isStudent = canAccess({permissions:['student:*']},permissions)
  const isTeacher = canAccess({permissions:['teacher:*']},permissions)
  const supported = isStudent || isTeacher

  useEffect(() => {
    if (!open) {
      setQuery('')
      setResults([])
      return
    }
    if (!supported) return
    if (debRef.current) window.clearTimeout(debRef.current)
    setLoading(true)
    debRef.current = window.setTimeout(async () => {
      try {
        const list = await loadDirectoryFor(permissions, query)
        setResults(list)
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, SEARCH_DEBOUNCE_MS)
  }, [open, query, permissions, supported])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const handlePickAgent = async (agent: AgentReference) => {
    if (creatingFor) return
    setCreatingFor(agent.id)
    try {
      const detail = await createOrGetAgentConversation(agent.id)
      useChatStore.getState().upsertConversation({
        ...detail,
        participants: [],
        unread_count: 0,
        last_message: null,
      })
      onConversationOpened(detail.id)
      onClose()
    } catch {
      // ignore — keep modal open
    } finally {
      setCreatingFor(null)
    }
  }

  const handlePick = async (user: UserReference) => {
    if (creatingFor || user.id == null) return
    setCreatingFor(user.id)
    try {
      const detail = await createOrGetDirectConversation(user.id)
      const me = useChatStore.getState().me
      const others = me
        ? detail.participants.filter((p) => p.id !== me.id)
        : detail.participants
      const summary: ConversationSummaryResponse = {
        ...detail,
        participants: others,
        unread_count: 0,
        last_message: null,
      }
      useChatStore.getState().upsertConversation(summary)
      onConversationOpened(detail.id)
      onClose()
    } catch {
      // ignore — keep modal open
    } finally {
      setCreatingFor(null)
    }
  }

  const sortedResults = useMemo(() => results, [results])

  const matchingAgents = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return agents
    return agents.filter(
      (a) => a.display_name.toLowerCase().includes(q) || a.slug.toLowerCase().includes(q),
    )
  }, [agents, query])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="w-full max-w-md rounded-2xl border bg-[var(--surface)] shadow-md flex flex-col max-h-[80vh]"
        style={{ borderColor: 'var(--border)' }}
      >
        <div
          className="flex items-center justify-between px-5 py-3 border-b"
          style={{ borderColor: 'var(--border)' }}
        >
          <h3 className="text-[15px] font-bold text-primary">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-[8px] flex items-center justify-center text-muted hover:bg-[var(--surface-2)]"
            aria-label="Close"
          >
            <HiOutlineXMark className="text-[18px]" />
          </button>
        </div>

        <div className="px-5 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
          <div
            className="flex items-center gap-2 rounded-[10px] border bg-[var(--surface-2)] px-3 py-2"
            style={{ borderColor: 'var(--border)' }}
          >
            <HiOutlineMagnifyingGlass className="text-muted shrink-0" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              autoFocus
              disabled={!supported}
              className="flex-1 bg-transparent text-[13px] text-primary placeholder:text-muted focus:outline-none"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto thin-scrollbar-light">
          {matchingAgents.length > 0 && (
            <ul className="flex flex-col border-b" style={{ borderColor: 'var(--border)' }}>
              {matchingAgents.map((agent) => (
                <li key={`agent-${agent.id}`}>
                  <button
                    type="button"
                    onClick={() => void handlePickAgent(agent)}
                    disabled={creatingFor !== null}
                    className="w-full flex items-center gap-3 px-5 py-3 text-start hover:bg-[var(--surface-2)] transition-colors disabled:opacity-60"
                  >
                    <Avatar userId={null} name={agent.display_name} isAgent size={36} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-[13.5px] font-semibold text-primary truncate">
                          {agent.display_name}
                        </p>
                        <span
                          className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full text-white shrink-0"
                          style={{ background: 'var(--accent)' }}
                        >
                          AI
                        </span>
                      </div>
                      <p className="text-[11.5px] text-muted truncate">
                        {agent.description || 'AI assistant'}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {!supported ? (
            <p className="text-center text-[12.5px] text-muted py-8 px-4">{unavailableLabel}</p>
          ) : loading ? (
            <p className="text-center text-[12.5px] text-muted py-6">…</p>
          ) : sortedResults.length === 0 ? (
            matchingAgents.length === 0 ? (
              <p className="text-center text-[12.5px] text-muted py-6">No matches</p>
            ) : null
          ) : (
            <ul className="flex flex-col">
              {sortedResults.map((u, i) => (
                <li
                  key={u.id}
                  className={`${i > 0 ? 'border-t border-[var(--border)]' : ''}`}
                >
                  <button
                    type="button"
                    onClick={() => handlePick(u)}
                    disabled={creatingFor !== null}
                    className="w-full flex items-center gap-3 px-5 py-3 text-start hover:bg-[var(--surface-2)] transition-colors disabled:opacity-60"
                  >
                    <Avatar
                      userId={u.id}
                      name={u.display_name}
                      online={u.is_online}
                      size={36}
                      avatarUrl={u.avatar_url}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13.5px] font-semibold text-primary truncate">
                        {u.display_name}
                      </p>
                      <p className="text-[11.5px] text-muted truncate capitalize">
                        {u.roles?.join(', ')}
                        {u.username && ` · ${u.username}`}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
