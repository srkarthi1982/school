import { HiOutlineTrash } from 'react-icons/hi2'
import Avatar from './Avatar'
import type { ConversationSummaryResponse, UserReference } from '../chat-types'

interface Props {
  conversation: ConversationSummaryResponse
  presenceByUserId: Record<number, boolean>
  onlineLabel: string
  offlineLabel: string
  clearChatLabel: string
  onClearChat: () => void
}

function pickOther(conv: ConversationSummaryResponse): UserReference | null {
  return conv.participants[0] ?? null
}

export default function ChatThreadHeader({
  conversation,
  presenceByUserId,
  onlineLabel,
  offlineLabel,
  clearChatLabel,
  onClearChat,
}: Props) {
  const agent =
    conversation.kind === 'agent' || conversation.kind === 'agent_doc' ? conversation.agent : null
  const other = agent ? null : pickOther(conversation)
  if (!agent && !other) return null
  const presenceFlag = typeof other?.id === 'number' ? presenceByUserId[other.id] : undefined
  const online = agent ? true : typeof presenceFlag === 'boolean' ? presenceFlag : !!other?.is_online
  const displayName = agent?.display_name ?? other?.display_name ?? ''
  return (
    <div className="flex items-center gap-3 px-5 py-3 border-b border-[var(--border)] shrink-0">
      {agent ? (
        <Avatar userId={null} name={displayName} isAgent size={40} />
      ) : (
        <Avatar userId={other!.id} name={displayName} online={online} size={40} avatarUrl={other!.avatar_url ?? null} />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-[14px] font-bold text-primary truncate">{displayName}</p>
          {agent && (
            <span
              className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full text-white shrink-0"
              style={{ background: 'var(--accent)' }}
            >
              AI Assistant
            </span>
          )}
        </div>
        <p className="text-[11.5px]" style={{ color: online ? 'var(--success)' : 'var(--text-muted)' }}>
          {online ? onlineLabel : offlineLabel}
        </p>
      </div>
      <button
        type="button"
        onClick={onClearChat}
        title={clearChatLabel}
        aria-label={clearChatLabel}
        className="shrink-0 p-2 rounded-md text-[var(--text-muted)] hover:text-[var(--danger)] hover:bg-[var(--surface-hover)] transition-colors"
      >
        <HiOutlineTrash className="w-5 h-5" />
      </button>
    </div>
  )
}
