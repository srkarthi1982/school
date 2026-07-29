import { useNavigate } from 'react-router-dom'
import { HiChevronDown, HiChevronUp, HiOutlineCheck } from 'react-icons/hi2'
import type { NotificationDto } from '../services/notificationApi'

interface Props {
  notification: NotificationDto
  isGroupType?:boolean | false
  isExpanded?:boolean | true
  groupUnreadCount?:number | 0
  onMarkRead: (id: number) => void
  onMarkAllRead?: () => void
  onToggleGroup?:(groupType:string) => void
}

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime()
  const diff = Math.max(0, Date.now() - then)
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return `${sec}s ago`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day}d ago`
  return new Date(iso).toLocaleDateString()
}

export const SOURCE_PILL_BG: Record<string, string> = {
  chat: 'bg-blue-100 text-blue-700',
  request: 'bg-violet-100 text-violet-700',
  quiz: 'bg-violet-100 text-violet-700',
  attendance: 'bg-amber-100 text-amber-700',
  system: 'bg-slate-100 text-slate-700',
  
}

export default function NotificationItem({ notification, isGroupType=false, isExpanded=true, groupUnreadCount=0, onMarkRead, onMarkAllRead, onToggleGroup }: Props) {
  const navigate = useNavigate()
  const unread = !notification.read_at
  const groupUnread = groupUnreadCount > 0
  const sourcePill = SOURCE_PILL_BG[notification.source_module] ?? 'bg-slate-100 text-slate-700'

  const handleNavigate = () => {
    const { source_module, link, payload } = notification

    if (!link) return

    if (unread) onMarkRead(notification.id)

    let targetUrl = link
    if (source_module === 'chat' && payload?.conversation_id) {
      targetUrl = `${link}?conversation=${encodeURIComponent(String(payload.conversation_id))}`
    } else if (source_module === 'schedule' && payload?.schedule_id) {
      targetUrl = `${link}?schedule=${encodeURIComponent(String(payload.schedule_id))}`
    }
    navigate(targetUrl)
  }

  const handleMark = (e: React.MouseEvent) => {
    e.stopPropagation()
    onMarkRead(notification.id)
  }

  return (
    <div
      onClick={() => {
        if(!isGroupType) handleNavigate();
      }}
      className={`group flex gap-3 px-4 py-3 border-b border-[var(--border)] cursor-pointer transition-colors ${unread ? 'bg-[var(--accent)]/5 hover:bg-[var(--accent)]/10' : 'hover:bg-[var(--surface-2)]'}`}
      style={{background: isGroupType ? 'var(--surface-2)' : ''}}
    >
      <div className="shrink-0 pt-1">
        <span
          className={`inline-block w-2 h-2 rounded-full ${(isExpanded && unread) || groupUnread  ? 'bg-[var(--accent)]' : 'bg-transparent'}`}
          aria-hidden="true"
        />
      </div>
      <div className="flex-1 min-w-0" style={{opacity:unread ? 1 : 0.5}}>
        <div className="flex items-center gap-2 mb-0.5">
          {isGroupType &&
          <span className={`px-2 py-0.5 text-[10px] font-semibold uppercase rounded ${sourcePill}`}>
            {notification.source_module}
          </span>
          }
          {notification.title && (
            <span className={`text-sm truncate ${unread || isGroupType ? 'font-semibold text-[var(--text)]' : 'font-medium text-[var(--text-2)]'}`}>
              {isGroupType && isExpanded ? 'Notifications messages' : notification.title}
            </span>
          )}
        </div>
        {notification.body &&  (!isGroupType || !isExpanded)  &&(
          <p className="text-xs text-[var(--text-2)] line-clamp-2">{notification.body}</p>
        )}
      </div>
      <div className={`shrink-0 flex flex-col items-end gap-1 `}>
        {(!isGroupType || !isExpanded)&& 
        <span className="text-[10px] text-[var(--text-2)] whitespace-nowrap">{timeAgo(notification.created_at)}</span>
        }
        {unread && (!isGroupType || !isExpanded) && (
          <button
            type="button"
            onClick={handleMark}
            className="opacity-0 group-hover:opacity-100 text-[10px] inline-flex items-center gap-1 px-1.5 py-0.5 pr-0 rounded text-[var(--accent)] hover:bg-[var(--accent)]/15 transition"
          >
            <HiOutlineCheck className="w-3 h-3" /> Mark read
          </button>
        )}
        {isGroupType && groupUnreadCount > 0 && onMarkAllRead && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onMarkAllRead(); }}
            className="opacity-0 group-hover:opacity-100 text-[10px] inline-flex items-center gap-1 px-1.5 py-0.5 pr-0 rounded text-[var(--accent)] hover:bg-[var(--accent)]/15 transition"
          >
            Mark all read
          </button>
        )}
      </div>
      {isGroupType && groupUnreadCount > 0 &&
      <div className="flex items-top h-full gap-3">
        {groupUnreadCount > 0 && (
          <span className="bg-[var(--accent)] text-white text-xs font-bold px-2 py-0.5 rounded-full">
            {groupUnreadCount}
          </span>
        )}        
      </div>
      }
      {
        isGroupType &&
        <span className="text-[var(--text-2)] text-sm">
          {
            isExpanded ? <HiChevronUp/> :<HiChevronDown/>
          }
        </span>

      }
    </div>
  )
}
