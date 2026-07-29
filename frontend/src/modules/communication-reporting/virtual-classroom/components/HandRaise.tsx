import {
  useDataChannel,
  useLocalParticipant,
  useParticipants,
} from '@livekit/components-react'
import { useCallback, useEffect } from 'react'
import { HiOutlineHandRaised } from 'react-icons/hi2'
import { create } from 'zustand'
import { useShallow } from 'zustand/react/shallow'
import { useI18n } from '../../../../infra/locales/I18nContext'

// Hand-raise is a custom UX layered on top of LiveKit via a topic-named
// data channel. Each participant tracks the local "is my hand raised"
// flag and broadcasts the change. Every other client maintains its own
// view of the global set keyed by participant identity. No backend.
//
// Shared state lives in a tiny Zustand store so HandRaiseButton (local
// toggle) and RaisedHandsList (everyone's raised state) stay in sync
// even though they don't share a hook instance. <HandRaiseSync> is the
// single subscriber to the data channel and participant list — drop it
// once in the same React tree as the button and list.

const TOPIC = 'classroom-hand-raise'

type Msg = { type: 'raise' | 'lower'; identity: string }

type State = {
  raised: ReadonlySet<string>
  iAmRaised: boolean
  setIAmRaised: (v: boolean) => void
  add: (id: string) => void
  remove: (id: string) => void
  syncWithParticipants: (presentIds: Set<string>) => void
}

const useStore = create<State>((set) => ({
  raised: new Set<string>(),
  iAmRaised: false,
  setIAmRaised: (v) => set({ iAmRaised: v }),
  add: (id) =>
    set((s) => {
      if (s.raised.has(id)) return s
      const next = new Set(s.raised)
      next.add(id)
      return { raised: next }
    }),
  remove: (id) =>
    set((s) => {
      if (!s.raised.has(id)) return s
      const next = new Set(s.raised)
      next.delete(id)
      return { raised: next }
    }),
  syncWithParticipants: (presentIds) =>
    set((s) => {
      let changed = false
      const next = new Set<string>()
      for (const id of s.raised) {
        if (presentIds.has(id)) next.add(id)
        else changed = true
      }
      return changed ? { raised: next } : s
    }),
}))

export function HandRaiseSync() {
  const { add, remove, syncWithParticipants } = useStore(
    useShallow((s) => ({
      add: s.add,
      remove: s.remove,
      syncWithParticipants: s.syncWithParticipants,
    })),
  )

  useDataChannel(
    TOPIC,
    useCallback(
      (message) => {
        try {
          const text = new TextDecoder().decode(message.payload)
          const msg = JSON.parse(text) as Msg
          if (!msg.identity) return
          if (msg.type === 'raise') add(msg.identity)
          else remove(msg.identity)
        } catch {
          // ignore malformed payloads from other clients
        }
      },
      [add, remove],
    ),
  )

  // When a participant disconnects mid-class, drop them from the raised
  // set so the list doesn't show ghost names.
  const participants = useParticipants()
  useEffect(() => {
    syncWithParticipants(new Set(participants.map((p) => p.identity)))
  }, [participants, syncWithParticipants])

  return null
}

export function HandRaiseButton() {
  const { t } = useI18n()
  const { send } = useDataChannel(TOPIC)
  const { localParticipant } = useLocalParticipant()
  const { iAmRaised, setIAmRaised, add, remove } = useStore(
    useShallow((s) => ({
      iAmRaised: s.iAmRaised,
      setIAmRaised: s.setIAmRaised,
      add: s.add,
      remove: s.remove,
    })),
  )

  const toggle = () => {
    if (!localParticipant) return
    const newState = !iAmRaised
    const id = localParticipant.identity
    setIAmRaised(newState)
    if (newState) add(id)
    else remove(id)
    const payload = new TextEncoder().encode(
      JSON.stringify({ type: newState ? 'raise' : 'lower', identity: id } satisfies Msg),
    )
    send(payload, { reliable: true, topic: TOPIC })
  }

  return (
    <button
      type="button"
      onClick={toggle}
      title={iAmRaised ? t('virtualClassroom.live.lowerHand') : t('virtualClassroom.live.raiseHand')}
      aria-pressed={iAmRaised}
      className={[
        'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full',
        'text-xs font-semibold border-none cursor-pointer shadow-elevated transition-colors',
        iAmRaised
          ? 'bg-yellow-400 text-yellow-900'
          : 'bg-surface text-primary hover:bg-surface-2',
      ].join(' ')}
    >
      <HiOutlineHandRaised className="text-[15px]" />
      <span className="hidden md:inline">
        {iAmRaised ? t('virtualClassroom.live.lowerHand') : t('virtualClassroom.live.raiseHand')}
      </span>
    </button>
  )
}

export function RaisedHandsList() {
  const { t } = useI18n()
  const raised = useStore((s) => s.raised)
  const participants = useParticipants()
  if (raised.size === 0) return null
  const lookup = new Map(participants.map((p) => [p.identity, p.name || p.identity]))
  const names = [...raised].map((id) => lookup.get(id) ?? id)
  return (
    // G27 — sit below the screen-share banner (which lives at top-3
    // start-3) so the two top-start overlays don't visually collide
    // when both fire at once.
    <div
      className="absolute top-16 start-3 z-30 max-w-xs px-3 py-2 rounded-lg bg-yellow-50 border border-yellow-300 text-yellow-900 shadow-elevated"
      role="status"
      aria-live="polite"
    >
      <div className="text-[11px] font-bold uppercase tracking-wide flex items-center gap-1.5">
        <HiOutlineHandRaised className="text-[13px]" />
        {t('virtualClassroom.live.handsRaised')} ({raised.size})
      </div>
      <ul className="mt-1 text-xs font-medium leading-relaxed list-none p-0 m-0">
        {names.map((name) => (
          <li key={name} className="truncate">{name}</li>
        ))}
      </ul>
    </div>
  )
}
