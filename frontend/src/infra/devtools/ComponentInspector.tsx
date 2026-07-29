import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * Dev-only component inspector.
 *
 * Toggle inspect mode with the floating 🔍 button (bottom-left) or the
 * **Ctrl/Cmd + Shift + X** hotkey. While ON, hovering any element highlights it
 * and shows its React component name plus original source location
 * (`file:line:col`), stamped at build time by the `inspect-loc` Babel plugin
 * (see vite.config.ts). Clicking an element opens that file in your editor via
 * Vite's `/__open-in-editor` endpoint (works when the dev server runs on your
 * own machine); the path is also copied to the clipboard so it stays useful in
 * remote/web sessions with no local editor. Press Esc to turn it off.
 *
 * Renders nothing in production builds.
 */

type Hover = { rect: DOMRect; loc: string; name: string }

const LOC_ATTR = 'data-inspect-loc'
const NAME_ATTR = 'data-inspect-name'
const UI_ATTR = 'data-inspector-ui' // marks our own overlay so we never inspect it
const STORAGE_KEY = 'devtools.inspector.enabled'

export default function ComponentInspector() {
  const [enabled, setEnabled] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === '1'
    } catch {
      return false
    }
  })
  const [hover, setHover] = useState<Hover | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const rafRef = useRef<number | null>(null)
  const lastElRef = useRef<Element | null>(null)

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast((cur) => (cur === msg ? null : cur)), 1800)
  }, [])

  const toggle = useCallback(() => setEnabled((v) => !v), [])

  // Persist the on/off choice across reloads.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0')
    } catch {
      /* storage may be unavailable */
    }
    if (!enabled) {
      setHover(null)
      lastElRef.current = null
    }
  }, [enabled])

  // Hotkey: Ctrl/Cmd+Shift+X toggles; Esc turns off.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'X' || e.key === 'x')) {
        e.preventDefault()
        toggle()
      } else if (e.key === 'Escape') {
        setEnabled(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggle])

  // While enabled: track the hovered element and intercept clicks.
  useEffect(() => {
    if (!enabled) return

    const insideOwnUi = (el: Element | null) => !!el?.closest(`[${UI_ATTR}]`)

    const onMove = (e: MouseEvent) => {
      if (rafRef.current != null) return
      rafRef.current = window.requestAnimationFrame(() => {
        rafRef.current = null
        const start = e.target as Element | null
        if (insideOwnUi(start)) return
        const el = start?.closest(`[${LOC_ATTR}]`) ?? null
        if (el === lastElRef.current) {
          if (el) setHover((h) => (h ? { ...h, rect: el.getBoundingClientRect() } : h))
          return
        }
        lastElRef.current = el
        if (!el) {
          setHover(null)
          return
        }
        setHover({
          rect: el.getBoundingClientRect(),
          loc: el.getAttribute(LOC_ATTR) ?? '',
          name: el.closest(`[${NAME_ATTR}]`)?.getAttribute(NAME_ATTR) ?? '',
        })
      })
    }

    const onClick = (e: MouseEvent) => {
      const target = e.target as Element | null
      if (insideOwnUi(target)) return // let our own button handle its click
      const loc = target?.closest(`[${LOC_ATTR}]`)?.getAttribute(LOC_ATTR)
      if (!loc) return
      e.preventDefault()
      e.stopPropagation()
      openInEditor(loc, showToast)
    }

    window.addEventListener('mousemove', onMove, true)
    window.addEventListener('click', onClick, true)
    return () => {
      window.removeEventListener('mousemove', onMove, true)
      window.removeEventListener('click', onClick, true)
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [enabled, showToast])

  return createPortal(
    <div {...{ [UI_ATTR]: '' }} style={{ position: 'fixed', inset: 0, zIndex: 2147483647, pointerEvents: 'none' }}>
      {enabled && hover && (
        <>
          <div
            style={{
              position: 'fixed',
              top: hover.rect.top,
              left: hover.rect.left,
              width: hover.rect.width,
              height: hover.rect.height,
              background: 'rgba(88, 166, 255, 0.18)',
              border: '1px solid rgba(88, 166, 255, 0.9)',
              borderRadius: 3,
              boxSizing: 'border-box',
            }}
          />
          <LocLabel rect={hover.rect} name={hover.name} loc={hover.loc} />
        </>
      )}

      {toast && <div style={toastStyle}>{toast}</div>}

      <button
        type="button"
        onClick={toggle}
        title="Toggle component inspector (Ctrl/Cmd+Shift+X) — click an element to open it in your editor"
        style={{
          position: 'fixed',
          bottom: 12,
          left: 12,
          pointerEvents: 'auto',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 10px',
          border: 'none',
          borderRadius: 999,
          cursor: 'pointer',
          font: '12px/1 system-ui, sans-serif',
          color: '#fff',
          background: enabled ? '#1f6feb' : 'rgba(31, 41, 55, 0.85)',
          boxShadow: enabled ? '0 0 0 3px rgba(31,111,235,0.35)' : '0 2px 6px rgba(0,0,0,0.3)',
        }}
      >
        🔍 Inspect{enabled ? ' · ON' : ''}
      </button>
    </div>,
    document.body,
  )
}

function LocLabel({ rect, name, loc }: { rect: DOMRect; name: string; loc: string }) {
  const above = rect.top > 28
  return (
    <div
      style={{
        position: 'fixed',
        top: above ? rect.top - 26 : rect.bottom + 4,
        left: Math.max(4, rect.left),
        maxWidth: '90vw',
        padding: '2px 8px',
        background: '#1f6feb',
        color: '#fff',
        font: '12px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace',
        borderRadius: 4,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
      }}
    >
      {name && <strong style={{ fontWeight: 700 }}>{name}</strong>}
      {name && <span style={{ opacity: 0.7 }}> · </span>}
      <span style={{ opacity: 0.92 }}>{loc}</span>
    </div>
  )
}

async function openInEditor(loc: string, showToast: (msg: string) => void) {
  // Copy first: the only reliably-useful action in remote/web sessions where no
  // local editor is reachable. Best-effort (needs a secure context).
  let copied = false
  try {
    await navigator.clipboard.writeText(loc)
    copied = true
  } catch {
    /* clipboard may be blocked */
  }

  try {
    // Launches the editor on the machine running the dev server (local dev);
    // a no-op in remote sessions, where the clipboard copy above is the result.
    const res = await fetch(`/__open-in-editor?file=${encodeURIComponent(loc)}`)
    if (res.ok) {
      showToast(copied ? `Open in editor · copied ${loc}` : `Open in editor: ${loc}`)
      return
    }
  } catch {
    /* endpoint absent — fall through */
  }
  showToast(copied ? `Copied ${loc}` : loc)
}

const toastStyle: React.CSSProperties = {
  position: 'fixed',
  bottom: 12,
  right: 12,
  padding: '6px 12px',
  background: '#1f2937',
  color: '#fff',
  font: '12px/1.5 ui-monospace, monospace',
  borderRadius: 6,
  boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
}
