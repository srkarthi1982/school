// Module-level state for the active Document Picture-in-Picture window.
// Lives outside React because (a) it's a non-serializable Window object,
// (b) the requestWindow() call must happen synchronously from a user
// gesture handler before React's render cycle decides whether <PiPHost>
// should mount, so the mode flip and the window handle have to flow
// through the same channel.

let currentPipWindow: Window | null = null

export function getPipWindow(): Window | null {
  return currentPipWindow
}

export function setPipWindow(w: Window | null): void {
  currentPipWindow = w
}

export function hasDocumentPipSupport(): boolean {
  return typeof window !== 'undefined' && 'documentPictureInPicture' in window
}

// Copy stylesheets and theme attributes from the main document into the
// PiP document so that Tailwind tokens, LiveKit styles, dark-mode and RTL
// look identical in the floating window.
export function syncStylesToPip(pipDoc: Document): void {
  Array.from(
    document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'),
  ).forEach((link) => {
    const cloned = pipDoc.createElement('link')
    cloned.rel = 'stylesheet'
    cloned.href = link.href
    if (link.crossOrigin) cloned.crossOrigin = link.crossOrigin
    pipDoc.head.appendChild(cloned)
  })
  Array.from(document.querySelectorAll<HTMLStyleElement>('style')).forEach(
    (style) => {
      const cloned = pipDoc.createElement('style')
      cloned.textContent = style.textContent
      pipDoc.head.appendChild(cloned)
    },
  )

  const html = pipDoc.documentElement
  const theme = document.documentElement.getAttribute('data-theme')
  if (theme) html.setAttribute('data-theme', theme)
  html.setAttribute(
    'dir',
    document.documentElement.getAttribute('dir') ?? 'ltr',
  )
  html.setAttribute('data-lk-theme', 'default')

  pipDoc.body.style.margin = '0'
  pipDoc.body.style.background = 'var(--bg, #0b1220)'
  pipDoc.body.style.fontFamily = getComputedStyle(document.body).fontFamily
}

// G6 — keep the PiP html attributes (data-theme, dir) in sync with the
// main document while the PiP window is open. Called once from
// <PiPHost>; returns the disconnect callback.
export function watchThemeSync(pipDoc: Document): () => void {
  const target = document.documentElement
  const dest = pipDoc.documentElement
  const mirror = (name: string) => {
    const value = target.getAttribute(name)
    if (value === null) dest.removeAttribute(name)
    else dest.setAttribute(name, value)
  }
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'attributes' && record.attributeName) {
        mirror(record.attributeName)
      }
    }
  })
  observer.observe(target, {
    attributes: true,
    attributeFilter: ['data-theme', 'dir', 'lang'],
  })
  return () => observer.disconnect()
}
