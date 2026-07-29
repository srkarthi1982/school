import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import useLoadingStore, { selectIsLoading } from '../store/useLoadingStore'

// Tuning — kept deliberately gentle so the bar reads as "very very subtle".
const START_DELAY = 120 // ms loading must persist before the bar appears (kills flicker on fast requests)
const MIN_VISIBLE = 300 // ms the bar stays up once shown (avoids a blink)
const FADE_MS = 250 // opacity fade-out after completing
const TRICKLE_MS = 400 // interval between trickle steps
const MAX_TRICKLE = 0.9 // never reach 100% until actually done

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/**
 * A super-thin progress line pinned to the top edge of the viewport. It trickles
 * forward while any HTTP request is in flight (driven by useLoadingStore) and
 * completes + fades when everything settles. NProgress-style, but hand-rolled so
 * it stays subtle and theme-aware (uses var(--accent)).
 */
export default function TopLoadingBar() {
  const isLoading = useLoadingStore(selectIsLoading)

  const [visible, setVisible] = useState(false)
  const [progress, setProgress] = useState(0) // 0..1
  const [fading, setFading] = useState(false)

  // Timers / bookkeeping kept in refs so effect re-runs don't lose them.
  const startTimer = useRef<number | null>(null)
  const trickleTimer = useRef<number | null>(null)
  const hideTimer = useRef<number | null>(null)
  const shownAt = useRef<number>(0)

  useEffect(() => {
    const clearTrickle = () => {
      if (trickleTimer.current) {
        window.clearInterval(trickleTimer.current)
        trickleTimer.current = null
      }
    }

    if (isLoading) {
      // Cancel any in-progress hide/fade — we're busy again.
      if (hideTimer.current) {
        window.clearTimeout(hideTimer.current)
        hideTimer.current = null
      }
      setFading(false)

      if (visible) return // already running

      if (startTimer.current) return // already waiting out the start delay
      startTimer.current = window.setTimeout(() => {
        startTimer.current = null
        shownAt.current = Date.now()
        setVisible(true)
        setProgress(0.08)
        if (prefersReducedMotion()) return
        trickleTimer.current = window.setInterval(() => {
          setProgress((p) => {
            if (p >= MAX_TRICKLE) return p
            // Ease off as we approach the cap: smaller steps the closer we get.
            const remaining = MAX_TRICKLE - p
            return p + Math.max(0.005, remaining * (0.1 + Math.random() * 0.1))
          })
        }, TRICKLE_MS)
      }, START_DELAY)
      return
    }

    // --- not loading ---
    // If we were still waiting out the start delay, the request was fast: cancel.
    if (startTimer.current) {
      window.clearTimeout(startTimer.current)
      startTimer.current = null
    }
    if (!visible) return

    clearTrickle()
    setProgress(1) // snap to complete

    const elapsed = Date.now() - shownAt.current
    const wait = Math.max(0, MIN_VISIBLE - elapsed)
    hideTimer.current = window.setTimeout(() => {
      hideTimer.current = null
      setFading(true)
      hideTimer.current = window.setTimeout(() => {
        hideTimer.current = null
        setVisible(false)
        setFading(false)
        setProgress(0)
      }, FADE_MS)
    }, wait)
  }, [isLoading, visible])

  // Cleanup on unmount.
  useEffect(
    () => () => {
      if (startTimer.current) window.clearTimeout(startTimer.current)
      if (trickleTimer.current) window.clearInterval(trickleTimer.current)
      if (hideTimer.current) window.clearTimeout(hideTimer.current)
    },
    [],
  )

  if (typeof document === 'undefined' || !visible) return null

  return createPortal(
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[1200] h-[2px]"
      style={{ opacity: fading ? 0 : 1, transition: `opacity ${FADE_MS}ms ease-out` }}
    >
      <div
        className="h-full"
        style={{
          width: `${Math.min(1, progress) * 100}%`,
          background: 'var(--accent)',
          opacity: 0.1,
          boxShadow: '0 0 6px var(--accent-glow), 0 0 2px var(--accent-glow)',
          transition: 'width 200ms ease-out',
        }}
      />
    </div>,
    document.body,
  )
}
