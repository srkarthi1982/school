import { useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { driver, type Driver, type PopoverDOM } from 'driver.js'
import 'driver.js/dist/driver.css'

import useGuideStore from './useGuideStore'
import { GUIDES } from './registry'
import { useI18n } from '../locales/I18nContext'
import useToastStore from '../shared/store/useToastStore'
import useChatWidgetStore from '../../modules/communication-reporting/chat/widget/useChatWidgetStore'

const WAIT_TIMEOUT_MS = 8000
const POLL_INTERVAL_MS = 200

/** True if a visible [data-guide="…"] element matching `selector` exists. */
function findVisibleGuide(selector: string): HTMLElement | null {
  const candidates = document.querySelectorAll<HTMLElement>(selector)
  for (const el of candidates) {
    // An element is "visible" if it has layout (offsetParent !== null), or
    // it is fixed/positioned out of normal flow with non-zero size. This way
    // the engine picks whichever nav anchor is on-screen (desktop sidebar
    // vs. mobile bottom-nav vs. More sheet) and skips the hidden ones.
    if (el.offsetParent !== null) return el
    const rect = el.getBoundingClientRect()
    if (rect.width > 0 && rect.height > 0) return el
  }
  return null
}

/** Wait (with MutationObserver + polling) for a visible anchor, with timeout. */
function waitForVisible(
  selector: string,
  timeoutMs: number,
): Promise<HTMLElement | null> {
  return new Promise((resolve) => {
    const existing = findVisibleGuide(selector)
    if (existing) return resolve(existing)

    let resolved = false
    const finish = (el: HTMLElement | null) => {
      if (resolved) return
      resolved = true
      window.clearInterval(interval)
      mo.disconnect()
      window.clearTimeout(timer)
      resolve(el)
    }

    const mo = new MutationObserver(() => {
      const el = findVisibleGuide(selector)
      if (el) finish(el)
    })
    mo.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'data-guide', 'hidden'],
    })

    const interval = window.setInterval(() => {
      const el = findVisibleGuide(selector)
      if (el) finish(el)
    }, POLL_INTERVAL_MS)

    const timer = window.setTimeout(() => {
      finish(findVisibleGuide(selector))
    }, timeoutMs)
  })
}

/** Match a react-router pathname against the step's expected route prefix. */
function routeMatches(pathname: string, route: string): boolean {
  if (pathname === route) return true
  return pathname.startsWith(route + '/')
}

export default function GuideEngine() {
  const activeId = useGuideStore((s) => s.activeId)
  const stepIndex = useGuideStore((s) => s.stepIndex)
  const next = useGuideStore((s) => s.next)
  const stop = useGuideStore((s) => s.stop)
  const { t } = useI18n()
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    if (!activeId) return
    const def = GUIDES[activeId]
    const step = def?.steps[stepIndex]
    if (!def || !step) {
      stop()
      return
    }

    let cancelled = false
    let driverInstance: Driver | null = null
    let clickTarget: HTMLElement | null = null
    let clickListener: ((e: Event) => void) | null = null
    let escapeListener: ((e: KeyboardEvent) => void) | null = null

    const cleanup = () => {
      if (driverInstance) {
        try {
          driverInstance.destroy()
        } catch {
          /* noop */
        }
        driverInstance = null
      }
      if (clickTarget && clickListener) {
        clickTarget.removeEventListener('click', clickListener, true)
      }
      clickTarget = null
      clickListener = null
      if (escapeListener) {
        window.removeEventListener('keydown', escapeListener)
        escapeListener = null
      }
    }

    const onPopoverRender = (popover: PopoverDOM) => {
      const total = def.steps.length
      const stepOfLabel = (t('guides.stepOf') as string)
        .replace('{x}', String(stepIndex + 1))
        .replace('{y}', String(total))
      // driver.js hides the title/description elements (display:none) when the
      // popover is created without `title`/`description` in its config — which
      // is our case, since we fill the text here instead. Setting textContent
      // alone leaves them invisible, so un-hide them explicitly.
      popover.title.textContent = stepOfLabel
      popover.title.style.display = 'block'
      popover.description.textContent = t(step.i18n) as string
      popover.description.style.display = 'block'
      popover.closeButton.setAttribute('aria-label', t('guides.stop') as string)
      popover.nextButton.textContent = t('guides.next') as string
    }

    void (async () => {
      // The chat widget would cover the spotlight — close it. When a tour
      // starts from the full chat page, the first step's `route` navigation
      // leaves it naturally.
      useChatWidgetStore.getState().close()

      if (step.route && !routeMatches(location.pathname, step.route)) {
        navigate(step.route)
      }

      const el = await waitForVisible(step.target, WAIT_TIMEOUT_MS)
      if (cancelled || !el) {
        if (!cancelled) {
          // Element never appeared — feature flag off, layout change, or the
          // user wandered off-route. Stop cleanly rather than fighting them.
          useToastStore.getState().push({
            variant: 'warning',
            title: "Couldn't find the next step.",
            body: 'The page may have changed.',
          })
          stop()
        }
        cleanup()
        return
      }
      if (cancelled) {
        cleanup()
        return
      }

      const advanceOn = step.advanceOn ?? 'click'
      const showNext = advanceOn === 'next'

      // Single-step highlight per step — the engine/store owns step
      // transitions (it has to drive navigation between routes), not the
      // library's own multi-step flow. Hooks below replace driver.js's
      // defaults so we don't `stop()` on our own cleanup-driven destroys:
      // when the engine advances steps it destroys the driver itself, which
      // would otherwise fire `onDestroyed` and wrongly reset the tour.
      driverInstance = driver({
        showButtons: showNext ? ['next', 'close'] : ['close'],
        allowClose: true,
        allowKeyboardControl: true,
        disableActiveInteraction: false,
        onPopoverRender,
        onNextClick: () => {
          driverInstance?.destroy()
          next()
        },
        onCloseClick: () => {
          driverInstance?.destroy()
          stop()
        },
      })

      driverInstance.highlight({
        element: el,
        popover: {
          showProgress: false,
          showButtons: showNext ? ['next', 'close'] : ['close'],
        },
        disableActiveInteraction: false,
      })

      // Escape anywhere also stops (driver.js allowKeyboardControl handles
      // the X button / overlay click already).
      escapeListener = (e) => {
        if (e.key === 'Escape') stop()
      }
      window.addEventListener('keydown', escapeListener)

      if (!showNext && el instanceof HTMLElement) {
        clickTarget = el
        clickListener = () => {
          // Let the click reach the real element first (it does — capture
          // fires during dispatch and the navigation/button action still
          // proceeds after). Then advance the store; the effect re-runs for
          // the next step.
          next()
        }
        el.addEventListener('click', clickListener, { capture: true, once: true })
      }
    })()

    return () => {
      cancelled = true
      cleanup()
    }
    // Re-run when the step or active guide changes; also when the route
    // changes so an in-flight navigation re-checks `step.route`.
  }, [activeId, stepIndex, location.pathname, navigate, t, next, stop])

  return null
}