import { HiOutlineTrash } from 'react-icons/hi2'
import Avatar from './Avatar'
import type { ConversationSummaryResponse, UserReference } from '../chat-types'

interface Props {
  conversation: ConversationSummaryResponse
  isActive: boolean
  presenceByUserId: Record<number, boolean>
  onClick: () => void
  isFirst: boolean
  onDelete?: () => void
  deleteLabel?: string
}

function pickOther(conv: ConversationSummaryResponse): UserReference | null {
  // For direct conversations, summary participants exclude self.
  return conv.participants[0] ?? null
}

function relativeTime(iso?: string | null): string {
  if (!iso) return ''
  const date = new Date(iso)
  const diffMs = Date.now() - date.getTime()
  const min = Math.round(diffMs / 60_000)
  if (min < 1) return 'now'
  if (min < 60) return `${min}m`
  const h = Math.round(min / 60)
  if (h < 24) return `${h}h`
  const d = Math.round(h / 24)
  if (d < 7) return `${d}d`
  try {
    return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date)
  } catch {
    return ''
  }
}

export default function ConversationItem({
  conversation,
  isActive,
  presenceByUserId,
  onClick,
  isFirst,
  onDelete,
  deleteLabel,
}: Props) {
  const agent = conversation.kind === 'agent' ? conversation.agent : null
  const other = agent ? null : pickOther(conversation)
  const name = agent?.display_name || other?.display_name || other?.full_name || 'Unknown'
  const presenceFlag = typeof other?.id === 'number' ? presenceByUserId[other.id] : undefined
  const online = typeof presenceFlag === 'boolean' ? presenceFlag : !!other?.is_online
  const unread = conversation.unread_count ?? 0
  const last = conversation.last_message
  const preview = last?.content ?? ''
  const timestamp = relativeTime(conversation.last_message_at ?? conversation.updated_at)
  const isUnread = unread > 0
  return (
    <div
      className="relative group"
      style={{
        background: isActive
          ? 'var(--accent-light)'
          : isUnread
          ? 'rgba(6,85,92,0.03)'
          : 'transparent',
        borderTop: isFirst ? 'none' : '1px solid var(--border)',
      }}
    >
      <button
        type="button"
        onClick={onClick}
        className="flex items-start gap-3 px-4 py-3 cursor-pointer w-full text-start transition-colors hover:bg-[var(--surface-2)] bg-transparent"
        style={{ border: 'none' }}
      >
        {agent ? (
          <Avatar userId={null} name={name} isAgent size={38} />
        ) : (
          other && <Avatar userId={other.id} name={name} online={online} size={38} avatarUrl={other.avatar_url ?? null} />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <p
              className="text-[13.5px] text-primary truncate"
              style={{ fontWeight: isUnread ? 700 : 500 }}
            >
              {name}
            </p>
            {agent && (
              <span
                className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full text-white shrink-0"
                style={{ background: 'var(--accent)' }}
              >
                AI
              </span>
            )}
            {timestamp && (
              <span
                className={`text-[11px] text-muted ms-auto shrink-0 transition-opacity ${
                  onDelete ? 'group-hover:opacity-0' : ''
                }`}
              >
                {timestamp}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <p
              className="text-[12.5px] truncate flex-1"
              style={{
                color: isUnread ? 'var(--text-primary)' : 'var(--text-muted)',
                fontWeight: isUnread ? 600 : 400,
              }}
            >
              {preview || <span className="italic text-muted">No messages yet</span>}
            </p>
            {isUnread && (
              <span
                className="px-1.5 py-0.5 rounded-full text-[10px] font-bold text-white min-w-[18px] text-center shrink-0"
                style={{ background: 'var(--accent)' }}
              >
                {unread}
              </span>
            )}
          </div>
        </div>
      </button>
      {onDelete && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          title={deleteLabel}
          aria-label={deleteLabel}
          className="absolute end-3 top-2.5 inline-flex items-center justify-center w-6 h-6 rounded-[7px] cursor-pointer opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity text-muted hover:text-[var(--danger,#dc2626)]"
          style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
        >
          <HiOutlineTrash className="text-[14px]" />
        </button>
      )}
    </div>
  )
}
