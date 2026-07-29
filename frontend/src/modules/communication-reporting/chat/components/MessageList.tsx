import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import MessageBubble from './MessageBubble'
import type { MessageResponse, PendingMessage } from '../chat-types'

interface Props {
  messages: MessageResponse[]
  pending: PendingMessage[]
  myUserId: number | undefined
  otherUserId: number | undefined
  otherReadAt: string | undefined
  hasMore: boolean
  onLoadOlder: () => void
  onRetry: (localId: string, content: string, attachmentIds: string[]) => void
  onDelete?: (messageId: string) => void
  onReply?: (msg: MessageResponse) => void
  onReact?: (messageId: string, emoji: string) => void
  replyLabel?: string
  reactLabel?: string
  attachmentLabel?: string
  todayLabel: string
  yesterdayLabel: string
}

function dayKey(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

function dayLabel(iso: string, today: string, yesterday: string): string {
  const d = new Date(iso)
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  const yest = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const isYest = d.toDateString() === yest.toDateString()
  if (isToday) return today
  if (isYest) return yesterday
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      year: now.getFullYear() === d.getFullYear() ? undefined : 'numeric',
    }).format(d)
  } catch {
    return ''
  }
}

export default function MessageList({
  messages,
  pending,
  myUserId,
  otherUserId,
  otherReadAt,
  hasMore,
  onLoadOlder,
  onRetry,
  onDelete,
  onReply,
  onReact,
  replyLabel,
  reactLabel,
  attachmentLabel,
  todayLabel,
  yesterdayLabel,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  // message id → row element, for jump-to-original when a quote is clicked
  const msgElRefs = useRef(new Map<string, HTMLElement>())
  const lastCount = useRef(0)
  const lastScrollHeight = useRef(0)
  // Send-anchoring: after I send a message it gets pinned to the top of the
  // viewport (with filler below) so a long reply reads from its start.
  const spacerRef = useRef<HTMLDivElement>(null)
  const anchorActive = useRef(false)
  const pinnedTop = useRef(0)
  const lastItemKey = useRef<string | null>(null)
  const lastConvId = useRef<string | null>(null)

  const items = useMemo(() => {
    const all: Array<
      | { kind: 'msg'; m: MessageResponse }
      | { kind: 'pending'; p: PendingMessage }
      | { kind: 'day'; label: string; key: string }
    > = []
    let lastDay = ''
    for (const m of messages) {
      const k = dayKey(m.created_at)
      if (k !== lastDay) {
        all.push({ kind: 'day', label: dayLabel(m.created_at, todayLabel, yesterdayLabel), key: k })
        lastDay = k
      }
      all.push({ kind: 'msg', m })
    }
    for (const p of pending) {
      all.push({ kind: 'pending', p })
    }
    return all
  }, [messages, pending, todayLabel, yesterdayLabel])

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const spacer = spacerRef.current

    type Item = (typeof items)[number]
    const isMineItem = (it: Item) =>
      it.kind === 'pending' ||
      (it.kind === 'msg' && (myUserId !== undefined ? it.m.sender.id === myUserId : it.m.is_mine))
    const keyOf = (it: Item | undefined) =>
      !it ? null : it.kind === 'day' ? `d:${it.key}` : it.kind === 'pending' ? `p:${it.p.localId}` : `m:${it.m.id}`

    const convId = messages[0]?.conversation_id ?? pending[0]?.conversationId ?? null
    const convChanged = convId !== lastConvId.current
    lastConvId.current = convId

    const isInitial = lastCount.current === 0
    const grew = items.length > lastCount.current
    const lastItem = items[items.length - 1]
    // "I just sent" = list grew AND the final item is a new message of mine.
    // (History prepends grow the list too, but keep the same final item.)
    const sentByMe =
      grew && !!lastItem && isMineItem(lastItem) && keyOf(lastItem) !== lastItemKey.current
    lastItemKey.current = keyOf(lastItem)

    // The element to pin: my most recent message (pending or saved)…
    let lastMineIdx = -1
    for (let i = items.length - 1; i >= 0; i--) {
      if (isMineItem(items[i])) { lastMineIdx = i; break }
    }
    // …widened to the start of the contiguous run of my messages ending
    // there. The optimistic bubble and its WS echo (or several rapid sends)
    // then pin as one block, so the view doesn't lurch while they merge.
    let mineIdx = lastMineIdx
    while (mineIdx > 0 && isMineItem(items[mineIdx - 1])) mineIdx--
    const anchorEl = mineIdx >= 0 ? (el.children[mineIdx] as HTMLElement | undefined) : undefined
    const lastMineEl = lastMineIdx >= 0 ? (el.children[lastMineIdx] as HTMLElement | undefined) : undefined
    // Positions in the list's own scroll-content space. offsetTop is useless
    // here — this div isn't positioned, so offsetParent is the widget's fixed
    // panel and offsetTop would include the headers above the list.
    const listRectTop = el.getBoundingClientRect().top
    const contentTop = (node: HTMLElement) =>
      node.getBoundingClientRect().top - listRectTop + el.scrollTop
    // Pin the sent bubble about a third of the way down the view — clearly
    // visible with prior context above it, while still leaving most of the
    // viewport below for the reply.
    const pinTopGap = Math.max(96, Math.round(el.clientHeight * 0.33))
    const anchorTop = anchorEl ? Math.max(0, Math.round(contentTop(anchorEl) - pinTopGap)) : 0
    const lastMineBottom = lastMineEl
      ? Math.round(contentTop(lastMineEl) + lastMineEl.offsetHeight)
      : 0

    const setSpacer = (px: number) => { if (spacer) spacer.style.height = `${px}px` }
    // Size the filler so the anchor can sit exactly at the top of the
    // viewport, then pin it there. As real replies land below, the filler
    // naturally shrinks toward zero on each recompute.
    const pinAnchor = () => {
      if (!anchorEl) return
      setSpacer(0)
      const below = el.scrollHeight - anchorTop
      setSpacer(Math.max(0, el.clientHeight - below))
      el.scrollTop = anchorTop
      // If the pinned run is taller than the view, favor the newest message —
      // the sender must always be able to see what they just sent.
      if (lastMineEl && lastMineBottom > el.scrollTop + el.clientHeight) {
        el.scrollTop = lastMineBottom - el.clientHeight + 12
      }
      pinnedTop.current = el.scrollTop
    }

    if (isInitial || convChanged) {
      anchorActive.current = false
      setSpacer(0)
      el.scrollTop = el.scrollHeight
    } else if (sentByMe && anchorEl) {
      anchorActive.current = true
      pinAnchor()
    } else if (
      anchorActive.current &&
      anchorEl &&
      // Still pinned if the viewport sits where we left it — allowing for the
      // browser clamping scrollTop when the list momentarily shrinks (the
      // optimistic bubble being replaced by the saved message).
      Math.abs(el.scrollTop - Math.min(pinnedTop.current, el.scrollHeight - el.clientHeight)) < 48
    ) {
      // List changed while the pin is intact — a reply landing below, or the
      // optimistic bubble being swapped for the saved copy (which can shrink
      // the list, not just grow it). Recompute the filler and re-pin instead
      // of scrolling, so my message stays put at the top.
      pinAnchor()
    } else {
      if (anchorActive.current) {
        // User scrolled away from the pin; drop it and the leftover filler
        // (content above the viewport is unaffected, so no visual jump).
        anchorActive.current = false
        setSpacer(0)
      }
      const nearBottom =
        el.scrollHeight - el.scrollTop - el.clientHeight < 120
      if (grew && nearBottom) {
        el.scrollTop = el.scrollHeight
      } else if (grew && el.scrollHeight !== lastScrollHeight.current) {
        // Old messages prepended — preserve scroll position
        el.scrollTop = el.scrollHeight - lastScrollHeight.current
      }
    }
    lastScrollHeight.current = el.scrollHeight
    lastCount.current = items.length
  }, [items, messages, pending, myUserId])

  const handleQuoteClick = useCallback((messageId: string) => {
    const node = msgElRefs.current.get(messageId)
    if (!node) return
    node.scrollIntoView({ behavior: 'smooth', block: 'center' })
    node.style.transition = 'background-color 0.3s ease'
    node.style.backgroundColor = 'color-mix(in srgb, var(--accent) 14%, transparent)'
    window.setTimeout(() => {
      node.style.backgroundColor = 'transparent'
    }, 1200)
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el || !hasMore) return
    const onScroll = () => {
      if (el.scrollTop < 80) onLoadOlder()
    }
    el.addEventListener('scroll', onScroll)
    return () => el.removeEventListener('scroll', onScroll)
  }, [hasMore, onLoadOlder])

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-y-auto thin-scrollbar-light px-3 py-3 flex flex-col gap-1.5 [overflow-anchor:none]"
    >
      {items.map((item, i) => {
        if (item.kind === 'day') {
          return (
            <div key={`day-${item.key}-${i}`} className="flex items-center justify-center my-2">
              <span
                className="text-[10.5px] uppercase tracking-wider px-2 py-0.5 rounded-full"
                style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}
              >
                {item.label}
              </span>
            </div>
          )
        }
        if (item.kind === 'pending') {
          const fakeMsg: MessageResponse = {
            id: item.p.localId,
            conversation_id: item.p.conversationId,
            content: item.p.content,
            attachments: [],
            reply_to: item.p.replyTo ?? null,
            created_at: item.p.createdAt,
            edited_at: null,
            is_mine: true,
            sender: {
              id: myUserId ?? 0,
              username: '',
              full_name: '',
              display_name: '',
              roles: [''],
            },
          }
          return (
            <MessageBubble
              key={item.p.localId}
              message={fakeMsg}
              pending={item.p}
              isMine
              read={false}
              onRetry={() => onRetry(item.p.localId, item.p.content, item.p.attachmentIds)}
            />
          )
        }
        const m = item.m
        const isMine = myUserId !== undefined ? m.sender.id === myUserId : m.is_mine
        const read =
          isMine && otherUserId !== undefined && otherReadAt
            ? new Date(otherReadAt).getTime() >= new Date(m.created_at).getTime()
            : false
        return (
          <div
            key={m.id}
            ref={(node) => {
              if (node) msgElRefs.current.set(m.id, node)
              else msgElRefs.current.delete(m.id)
            }}
            className="rounded-lg"
          >
            <MessageBubble
              message={m}
              isMine={isMine}
              read={read}
              onDelete={isMine && onDelete ? () => onDelete(m.id) : undefined}
              onReply={onReply ? () => onReply(m) : undefined}
              onReact={!isMine && onReact ? (emoji) => onReact(m.id, emoji) : undefined}
              onQuoteClick={handleQuoteClick}
              replyLabel={replyLabel}
              reactLabel={reactLabel}
              attachmentLabel={attachmentLabel}
            />
          </div>
        )
      })}
      {/* Filler that lets the last sent message reach the top of the
          viewport; sized imperatively by the send-anchoring effect. */}
      <div ref={spacerRef} aria-hidden="true" className="shrink-0" />
    </div>
  )
}
