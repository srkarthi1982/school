import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { getPipWindow, watchThemeSync } from './pipWindow'

// Reads the already-opened Document Picture-in-Picture window (opened from
// the user-gesture handler in <DockedClassroom>) and portals its children
// into pipDoc.body. The window itself is opened up the call stack — see
// pipWindow.ts — to satisfy the browser's user-activation requirement.
//
// Window lifecycle (close on mode change) is managed by ClassroomMount's
// mode-change effect, NOT here. Doing it here would double-fire under
// React StrictMode (mount → cleanup → re-mount in dev), which would close
// the window we just opened and immediately drop back to docked.
export default function PiPHost({ children }: { children: ReactNode }) {
  const [pip] = useState<Window | null>(() => getPipWindow())

  // G6 — keep the PiP <html> attributes (data-theme, dir, lang) mirrored
  // to the main document so toggling dark mode or RTL while the floating
  // window is open updates it immediately.
  useEffect(() => {
    if (!pip || pip.closed) return
    const stop = watchThemeSync(pip.document)
    return stop
  }, [pip])

  if (!pip || pip.closed) return null
  return createPortal(children, pip.document.body)
}
