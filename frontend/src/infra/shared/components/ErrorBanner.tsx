import { useState } from 'react'
import {
  HiOutlineExclamationCircle,
  HiOutlineChevronDown,
  HiOutlineChevronRight,
} from 'react-icons/hi2'
import { useServerErrorStore } from '../store/useServerErrorStore'

// Matches the "(ref: <request_id>)" suffix appended to internal-server-error
// messages by extractErrorMessage, so we can pair the message with its traceback.
const REF_RE = /\(ref:\s*([a-z0-9]+)\)/i

interface Props {
  message: string
  onDismiss: () => void
}

/**
 * Red error banner. For unexpected server errors it offers a "Show details"
 * expander that reveals the trimmed traceback the backend returned (DEBUG mode),
 * looked up by the request id embedded in the message.
 */
export default function ErrorBanner({ message, onDismiss }: Props) {
  const [open, setOpen] = useState(false)
  const last = useServerErrorStore((s) => s.last)

  const refId = message.match(REF_RE)?.[1]
  const details = refId && last?.requestId === refId ? last.details : []
  const hasDetails = details.length > 0

  return (
    <div className="mb-4 px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20">
      <div className="flex items-start gap-2">
        <HiOutlineExclamationCircle className="text-red-500 text-[15px] mt-px shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-red-500 break-words">{message}</p>
          {hasDetails && (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-red-500/80 hover:text-red-500 cursor-pointer bg-transparent border-none p-0"
            >
              {open ? (
                <HiOutlineChevronDown className="text-[13px]" />
              ) : (
                <HiOutlineChevronRight className="text-[13px]" />
              )}
              {open ? 'Hide details' : 'Show details'}
            </button>
          )}
          {open && hasDetails && (
            <pre className="mt-2 max-h-60 overflow-auto rounded-md bg-red-500/5 border border-red-500/15 p-2 text-[11px] leading-relaxed text-red-600/90 whitespace-pre-wrap break-words font-mono">
              {details.join('\n')}
            </pre>
          )}
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="text-red-500 text-xs font-bold uppercase tracking-wider shrink-0 cursor-pointer bg-transparent border-none"
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}
