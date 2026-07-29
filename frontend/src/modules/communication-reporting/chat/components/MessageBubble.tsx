import { useEffect, useRef, useState } from 'react'
import {
  HiOutlineClock,
  HiOutlineExclamationCircle,
  HiCheck,
  HiOutlinePhoto,
  HiOutlineDocumentText,
  HiOutlineFilm,
  HiOutlineArrowDownTray,
  HiOutlineArrowUturnLeft,
  HiOutlinePaperClip,
  HiOutlineTrash,
  HiOutlinePlayCircle,
  HiOutlineFaceSmile,
} from 'react-icons/hi2'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import type { MessageResponse, PendingMessage } from '../chat-types'
import { attachmentUrl, thumbnailUrl } from '../chat-api'
import { useI18n } from '../../../../infra/locales/I18nContext'
import { GUIDES } from '../../../../infra/guides/registry'
import useGuideStore from '../../../../infra/guides/useGuideStore'
import useAuthStore from '../../../../infra/auth/useAuthStore'
import { canAccess } from '../../../../infra/shared/utils/menuUtils'

interface Props {
  message: MessageResponse
  pending?: PendingMessage
  isMine: boolean
  read: boolean
  onRetry?: () => void
  onDelete?: () => void
  onReply?: () => void
  onReact?: (emoji: string) => void
  onQuoteClick?: (messageId: string) => void
  replyLabel?: string
  reactLabel?: string
  attachmentLabel?: string
}

// WhatsApp-style quick reactions offered in the picker bar.
const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏']

function formatTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(iso))
  } catch {
    return ''
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function fileIcon(contentType: string) {
  if (contentType.startsWith('image/')) return <HiOutlinePhoto className="text-xl" />
  if (contentType.startsWith('video/')) return <HiOutlineFilm className="text-xl" />
  return <HiOutlineDocumentText className="text-xl" />
}

/** Flatten a markdown `code` block's children into the raw text it contains. */
function rawTextFromChildren(children: unknown): string {
  if (typeof children === 'string') return children
  if (typeof children === 'number') return String(children)
  if (Array.isArray(children)) return children.map(rawTextFromChildren).join('')
  return ''
}

/**
 * Renders the fenced ```guide { "id": "…" } ``` block produced by the agent
 * as a "Show me how" button. Hides itself on malformed JSON, unknown guide
 * ids, or guides the current user can no longer access (defence in depth —
 * an old message may reference something the user lost access to).
 */
function GuideChip({ children }: { children: unknown }) {
  const { t } = useI18n()
  const raw = rawTextFromChildren(children).trim()
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  const id = (parsed as { id?: unknown } | null)?.id
  if (typeof id !== 'string') return null
  const def = GUIDES[id]
  if (!def) return null
  if (def.permissions && def.permissions.length > 0) {
    const perms = useAuthStore.getState().permissions
    if (!canAccess({ permissions: def.permissions }, perms)) return null
  }
  return (
    <button
      type="button"
      onClick={() => useGuideStore.getState().start(id)}
      className="mt-1 mb-2 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-semibold text-white transition-opacity hover:opacity-90 border-none cursor-pointer"
      style={{ background: 'var(--accent)' }}
    >
      <HiOutlinePlayCircle className="text-[15px] shrink-0" />
      <span>{t('guides.showMe') as string}</span>
    </button>
  )
}

function MarkdownContent({ content, isMine }: { content: string; isMine: boolean }) {
  const codeBg = isMine ? 'bg-white/20' : 'bg-black/10'
  const blockquoteBorder = isMine ? 'border-white/40' : 'border-current'

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkBreaks]}
      components={{
        p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
        h1: ({ children }) => <h1 className="text-base font-bold mb-2">{children}</h1>,
        h2: ({ children }) => <h2 className="text-[15px] font-bold mb-2">{children}</h2>,
        h3: ({ children }) => <h3 className="text-[14px] font-bold mb-1.5">{children}</h3>,
        h4: ({ children }) => <h4 className="text-[13.5px] font-bold mb-1">{children}</h4>,
        ul: ({ children }) => <ul className="list-disc pl-5 mb-2">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal pl-5 mb-2">{children}</ol>,
        li: ({ children }) => <li className="mb-0.5">{children}</li>,
        code: ({ children, className }) => {
          if (className === 'language-guide') {
            return (
              <div>
                <GuideChip children={children} />
              </div>
            )
          }
          const isInline = !className
          if (isInline) {
            return (
              <code className={`${codeBg} rounded px-1 py-0.5 text-[12px] font-mono`}>
                {children}
              </code>
            )
          }
          return (
            <pre className={`${codeBg} rounded p-2 overflow-x-auto mb-2`}>
              <code className="text-[12px] font-mono">{children}</code>
            </pre>
          )
        },
        blockquote: ({ children }) => (
          <blockquote className={`border-l-2 ${blockquoteBorder} pl-3 italic opacity-80 mb-2`}>
            {children}
          </blockquote>
        ),
        a: ({ children, href }) => (
          <a href={href} target="_blank" rel="noopener noreferrer" className="underline">
            {children}
          </a>
        ),
        hr: () => <hr className="border-current opacity-30 my-2" />,
        table: ({ children }) => (
          <table className="w-full text-left border-collapse mb-2 text-[12px]">{children}</table>
        ),
        thead: ({ children }) => <thead className="font-semibold">{children}</thead>,
        th: ({ children }) => (
          <th className="border border-current/20 px-2 py-1">{children}</th>
        ),
        td: ({ children }) => (
          <td className="border border-current/20 px-2 py-1">{children}</td>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  )
}

function QuotedReply({
  replyTo,
  isMine,
  attachmentLabel,
  onQuoteClick,
}: {
  replyTo: NonNullable<MessageResponse['reply_to']>
  isMine: boolean
  attachmentLabel: string
  onQuoteClick?: (messageId: string) => void
}) {
  const showAttachment = replyTo.has_attachments && !replyTo.content
  return (
    <button
      type="button"
      onClick={onQuoteClick ? () => onQuoteClick(replyTo.id) : undefined}
      className={`w-full text-start rounded-lg border-s-2 px-2.5 py-1.5 mb-1.5 block ${
        onQuoteClick ? 'cursor-pointer hover:opacity-90' : 'cursor-default'
      }`}
      style={{
        background: isMine ? 'rgba(255,255,255,0.15)' : 'var(--surface-1, rgba(0,0,0,0.05))',
        borderColor: isMine ? 'rgba(255,255,255,0.6)' : 'var(--accent)',
      }}
    >
      <p
        className={`text-[11px] font-semibold truncate ${isMine ? 'text-white/90' : ''}`}
        style={isMine ? undefined : { color: 'var(--accent)' }}
      >
        {replyTo.sender.display_name}
      </p>
      {showAttachment ? (
        <p className={`text-[11.5px] truncate inline-flex items-center gap-1 ${isMine ? 'text-white/75' : 'text-muted'}`}>
          <HiOutlinePaperClip className="shrink-0" /> {attachmentLabel}
        </p>
      ) : (
        <p
          className={`text-[11.5px] truncate ${replyTo.is_deleted ? 'italic' : ''} ${
            isMine ? 'text-white/75' : 'text-muted'
          }`}
        >
          {replyTo.content}
        </p>
      )}
    </button>
  )
}

function Attachments({
  attachments,
  isMine,
}: {
  attachments: MessageResponse['attachments']
  isMine: boolean
}) {
  if (!attachments || attachments.length === 0) return null
  return (
    <div className="flex flex-col gap-2 mt-2">
      {attachments.map((att) => {
        if (att.content_type.startsWith('image/')) {
          return (
            <a
              key={att.id}
              href={attachmentUrl(att.id)}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-lg overflow-hidden max-w-[260px]"
              style={{ background: isMine ? 'rgba(255,255,255,0.15)' : 'var(--surface-2)' }}
            >
              {att.has_thumbnail ? (
                <img
                  src={thumbnailUrl(att.id)}
                  alt={att.filename}
                  className="w-full h-auto object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="flex items-center gap-2 px-3 py-2">
                  <HiOutlinePhoto className="text-lg shrink-0" />
                  <span className="text-[12px] truncate">{att.filename}</span>
                </div>
              )}
            </a>
          )
        }

        if (att.content_type.startsWith('video/')) {
          return (
            <div
              key={att.id}
              className="rounded-lg overflow-hidden max-w-[260px]"
              style={{ background: isMine ? 'rgba(255,255,255,0.15)' : 'var(--surface-2)' }}
            >
              <video controls preload="metadata" className="w-full max-h-[200px]">
                <source src={attachmentUrl(att.id)} type={att.content_type} />
              </video>
            </div>
          )
        }

        return (
          <a
            key={att.id}
            href={attachmentUrl(att.id)}
            download={att.filename}
            className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 max-w-[260px] transition-colors hover:opacity-90"
            style={{ background: isMine ? 'rgba(255,255,255,0.15)' : 'var(--surface-2)' }}
          >
            <span className="shrink-0">{fileIcon(att.content_type)}</span>
            <div className="min-w-0 flex-1">
              <p className="text-[12.5px] font-medium truncate">{att.filename}</p>
              <p className="text-[10.5px] opacity-70">{formatSize(att.file_size)}</p>
            </div>
            <HiOutlineArrowDownTray className="text-sm shrink-0 opacity-70" />
          </a>
        )
      })}
    </div>
  )
}

/**
 * The "React" affordance shown on received messages: a face button that
 * reveals a small horizontal bar of quick emojis, WhatsApp-style. Closes on
 * outside click / Escape.
 */
function ReactionPicker({ onReact, reactLabel }: { onReact: (emoji: string) => void; reactLabel: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-0.5 opacity-60 hover:opacity-100"
        aria-label={reactLabel}
        title={reactLabel}
      >
        <HiOutlineFaceSmile className="text-xs" />
      </button>
      {open && (
        <div
          className="absolute bottom-full mb-1.5 start-0 z-20 flex items-center gap-0.5 rounded-full border px-1.5 py-1 shadow-lg"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
          role="menu"
        >
          {QUICK_REACTIONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => {
                onReact(emoji)
                setOpen(false)
              }}
              className="rounded-full p-1 text-[16px] leading-none transition-transform hover:scale-125"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Reaction chips shown under a bubble. On received messages the chips are
 * interactive (tap your own to toggle it off, or tap another to switch);
 * on your own messages they are read-only since you can't react to them.
 */
function ReactionPills({
  reactions,
  isMine,
  onReact,
}: {
  reactions: NonNullable<MessageResponse['reactions']>
  isMine: boolean
  onReact?: (emoji: string) => void
}) {
  if (reactions.length === 0) return null
  return (
    <div className={`flex flex-wrap gap-1 mt-1 ${isMine ? 'justify-end' : 'justify-start'}`}>
      {reactions.map((r) => (
        <button
          key={r.emoji}
          type="button"
          disabled={isMine || !onReact}
          onClick={onReact ? () => onReact(r.emoji) : undefined}
          className={`inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[11px] leading-none ${
            isMine || !onReact ? 'cursor-default' : 'cursor-pointer hover:opacity-80'
          }`}
          style={{
            background: r.mine ? 'color-mix(in srgb, var(--accent) 18%, var(--surface))' : 'var(--surface)',
            borderColor: r.mine ? 'var(--accent)' : 'var(--border)',
          }}
          aria-label={`${r.emoji} ${r.count}`}
        >
          <span className="text-[13px] leading-none">{r.emoji}</span>
          {r.count > 1 && <span className="text-muted">{r.count}</span>}
        </button>
      ))}
    </div>
  )
}

export default function MessageBubble({
  message,
  pending,
  isMine,
  read,
  onRetry,
  onDelete,
  onReply,
  onReact,
  onQuoteClick,
  replyLabel,
  reactLabel,
  attachmentLabel,
}: Props) {
  const failed = pending?.status === 'failed'
  const isDeleted = message.content === '[message deleted]'
  const reactions = message.reactions ?? []
  return (
    <div className={`flex ${isMine ? 'justify-end' : 'justify-start'} px-1`}>
      <div className={`flex flex-col max-w-[75%] ${isMine ? 'items-end' : 'items-start'}`}>
      <div
        className={`px-3.5 py-2 text-[13.5px] leading-snug break-words ${
          isMine
            ? 'rounded-2xl rounded-br-md text-white'
            : 'rounded-2xl rounded-bl-md text-primary border'
        }`}
        style={{
          background: isMine ? 'var(--accent)' : 'var(--surface-2)',
          borderColor: isMine ? 'transparent' : 'var(--border)',
          opacity: pending?.status === 'pending' ? 0.65 : 1,
        }}
      >
        {message.reply_to && !isDeleted && (
          <QuotedReply
            replyTo={message.reply_to}
            isMine={isMine}
            attachmentLabel={attachmentLabel ?? 'Attachment'}
            onQuoteClick={onQuoteClick}
          />
        )}
        {message.content && <MarkdownContent content={message.content} isMine={isMine} />}
        <Attachments attachments={message.attachments} isMine={isMine} />
        <div
          className={`mt-1 flex items-center gap-1 text-[10.5px] ${
            isMine ? 'justify-end text-white/80' : 'text-muted'
          }`}
        >
          <span>{formatTime(message.created_at)}</span>
          {isMine && !pending && (
            <span className="inline-flex items-center" aria-label={read ? 'read' : 'sent'}>
              <HiCheck className="-mr-1.5" style={{ opacity: read ? 1 : 0.6 }} />
              <HiCheck style={{ opacity: read ? 1 : 0 }} />
            </span>
          )}
          {pending?.status === 'pending' && <HiOutlineClock />}
          {failed && (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center gap-0.5 text-red-300 hover:text-white"
              aria-label="Retry sending message"
            >
              <HiOutlineExclamationCircle /> retry
            </button>
          )}
          {onReply && !pending && !isDeleted && (
            <button
              type="button"
              onClick={onReply}
              className="inline-flex items-center gap-0.5 opacity-60 hover:opacity-100"
              aria-label={replyLabel ?? 'Reply'}
              title={replyLabel ?? 'Reply'}
            >
              <HiOutlineArrowUturnLeft className="text-xs" />
            </button>
          )}
          {/* Reactions apply to received messages only — never to your own. */}
          {!isMine && onReact && !pending && !isDeleted && (
            <ReactionPicker onReact={onReact} reactLabel={reactLabel ?? 'React'} />
          )}
          {isMine && !pending && !isDeleted && (
            <button
              type="button"
              onClick={onDelete}
              className="inline-flex items-center gap-0.5 opacity-60 hover:opacity-100"
              aria-label="Delete message"
            >
              <HiOutlineTrash className="text-xs" />
            </button>
          )}
        </div>
      </div>
      {!isDeleted && (
        <ReactionPills reactions={reactions} isMine={isMine} onReact={!isMine ? onReact : undefined} />
      )}
      </div>
    </div>
  )
}
