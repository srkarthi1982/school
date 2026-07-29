import { useCallback, useEffect, useState } from 'react'
import {
  HiOutlineClipboard,
  HiOutlineClipboardDocumentCheck,
  HiOutlineKey,
  HiOutlinePlus,
  HiOutlineTrash,
  HiOutlineXMark,
} from 'react-icons/hi2'
import {
  createTokenApiV1PatsPost,
  listTokensApiV1PatsGet,
  revokeTokenApiV1PatsTokenIdDelete,
} from '../../../api/generated'
import type { AppModulesPatSchemasTokenResponse as TokenResponse } from '../../../api/generated'
import { confirmDialog } from '../../../infra/shared/store/useConfirmStore'

const EXPIRY_OPTIONS = [30, 90, 180] as const

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(iso))
  } catch {
    return '—'
  }
}

export default function PersonalAccessTokens() {
  const [tokens, setTokens] = useState<TokenResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [name, setName] = useState('')
  const [expiry, setExpiry] = useState<(typeof EXPIRY_OPTIONS)[number]>(90)
  const [creating, setCreating] = useState(false)
  const [newToken, setNewToken] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const { data } = await listTokensApiV1PatsGet()
      if (data) setTokens(data.items)
    } catch {
      // ignore — section shows empty state
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const handleCreate = async () => {
    if (!name.trim() || creating) return
    setCreating(true)
    try {
      const { data } = await createTokenApiV1PatsPost({
        body: { name: name.trim(), expires_in_days: expiry },
      })
      if (data) {
        setNewToken(data.token)
        setDialogOpen(false)
        setName('')
        void refresh()
      }
    } catch {
      // keep dialog open so the user can retry
    } finally {
      setCreating(false)
    }
  }

  const handleRevoke = async (token: TokenResponse) => {
    const ok = await confirmDialog({
      title: 'Revoke token?',
      message: `"${token.name}" will stop working immediately. Any MCP client using it loses access.`,
      confirmLabel: 'Revoke',
      cancelLabel: 'Cancel',
      tone: 'danger',
    })
    if (!ok) return
    try {
      await revokeTokenApiV1PatsTokenIdDelete({ path: { token_id: token.id } })
      void refresh()
    } catch {
      // ignore
    }
  }

  const handleCopy = async () => {
    if (!newToken) return
    try {
      await navigator.clipboard.writeText(newToken)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard unavailable — user can select manually
    }
  }

  const active = tokens.filter((t) => !t.revoked_at)

  return (
    <>
      <p className="text-[11px] font-bold text-muted tracking-[0.1em] uppercase mb-3">
        Personal Access Tokens
      </p>
      <div className="card px-6 py-5 mb-5">
        <div className="flex items-center justify-between gap-4 mb-1">
          <div className="flex items-center gap-3 min-w-0">
            <span
              className="w-10 h-10 rounded-xl flex items-center justify-center text-[20px] shrink-0"
              style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}
            >
              <HiOutlineKey />
            </span>
            <div className="min-w-0">
              <p className="text-[13.5px] font-bold text-primary">API access for external tools</p>
              <p className="text-[12px] text-muted leading-relaxed">
                Tokens let MCP-compatible clients (e.g. AI assistants) access the system as you,
                limited to what your role can already see.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-[10px] text-[12.5px] font-semibold text-white cursor-pointer border-none shrink-0"
            style={{ background: 'var(--accent)' }}
          >
            <HiOutlinePlus className="text-[15px]" />
            New token
          </button>
        </div>

        {loading ? (
          <p className="text-[12.5px] text-muted py-4 text-center">…</p>
        ) : active.length === 0 ? (
          <p className="text-[12.5px] text-muted py-4 text-center">No active tokens</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="text-start text-muted border-b" style={{ borderColor: 'var(--border)' }}>
                  <th className="text-start font-semibold py-2 pe-4">Name</th>
                  <th className="text-start font-semibold py-2 pe-4">Token</th>
                  <th className="text-start font-semibold py-2 pe-4">Created</th>
                  <th className="text-start font-semibold py-2 pe-4">Expires</th>
                  <th className="text-start font-semibold py-2 pe-4">Last used</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {active.map((token) => (
                  <tr key={token.id} className="border-b last:border-b-0" style={{ borderColor: 'var(--border)' }}>
                    <td className="py-2.5 pe-4 font-semibold text-primary">{token.name}</td>
                    <td className="py-2.5 pe-4 font-mono text-muted">{token.token_prefix}…</td>
                    <td className="py-2.5 pe-4 text-muted">{formatDate(token.created_at)}</td>
                    <td className="py-2.5 pe-4 text-muted">{formatDate(token.expires_at)}</td>
                    <td className="py-2.5 pe-4 text-muted">{formatDate(token.last_used_at)}</td>
                    <td className="py-2.5 text-end">
                      <button
                        type="button"
                        onClick={() => void handleRevoke(token)}
                        title="Revoke token"
                        aria-label={`Revoke ${token.name}`}
                        className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--danger)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer border-none bg-transparent"
                      >
                        <HiOutlineTrash className="text-[16px]" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {dialogOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDialogOpen(false)
          }}
        >
          <div className="w-full max-w-sm rounded-2xl border bg-[var(--surface)] shadow-md" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
              <h3 className="text-[15px] font-bold text-primary">New access token</h3>
              <button
                type="button"
                onClick={() => setDialogOpen(false)}
                className="w-8 h-8 rounded-[8px] flex items-center justify-center text-muted hover:bg-[var(--surface-2)] cursor-pointer border-none bg-transparent"
                aria-label="Close"
              >
                <HiOutlineXMark className="text-[18px]" />
              </button>
            </div>
            <div className="px-5 py-4 flex flex-col gap-3">
              <label className="text-[12px] font-semibold text-primary">
                Name
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Claude Desktop"
                  maxLength={100}
                  autoFocus
                  className="mt-1 w-full rounded-[10px] border bg-[var(--surface-2)] px-3 py-2 text-[13px] text-primary placeholder:text-muted focus:outline-none"
                  style={{ borderColor: 'var(--border)' }}
                />
              </label>
              <label className="text-[12px] font-semibold text-primary">
                Expires in
                <select
                  value={expiry}
                  onChange={(e) => setExpiry(Number(e.target.value) as (typeof EXPIRY_OPTIONS)[number])}
                  className="mt-1 w-full rounded-[10px] border bg-[var(--surface-2)] px-3 py-2 text-[13px] text-primary focus:outline-none"
                  style={{ borderColor: 'var(--border)' }}
                >
                  {EXPIRY_OPTIONS.map((days) => (
                    <option key={days} value={days}>{days} days</option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={() => void handleCreate()}
                disabled={!name.trim() || creating}
                className="mt-1 w-full py-2.5 rounded-[10px] text-[13px] font-semibold text-white cursor-pointer border-none disabled:opacity-60"
                style={{ background: 'var(--accent)' }}
              >
                {creating ? 'Creating…' : 'Create token'}
              </button>
            </div>
          </div>
        </div>
      )}

      {newToken && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-lg rounded-2xl border bg-[var(--surface)] shadow-md" style={{ borderColor: 'var(--border)' }}>
            <div className="px-5 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
              <h3 className="text-[15px] font-bold text-primary">Copy your token now</h3>
            </div>
            <div className="px-5 py-4">
              <p className="text-[12.5px] text-muted mb-3">
                This token is shown only once. Store it somewhere safe — you won't be able to see
                it again.
              </p>
              <div
                className="flex items-center gap-2 rounded-[10px] border bg-[var(--surface-2)] px-3 py-2.5"
                style={{ borderColor: 'var(--border)' }}
              >
                <code className="flex-1 min-w-0 text-[12px] break-all select-all text-primary">{newToken}</code>
                <button
                  type="button"
                  onClick={() => void handleCopy()}
                  title="Copy to clipboard"
                  aria-label="Copy token"
                  className="p-2 rounded-md text-[var(--text-muted)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer border-none bg-transparent shrink-0"
                >
                  {copied ? (
                    <HiOutlineClipboardDocumentCheck className="text-[18px]" style={{ color: 'var(--success)' }} />
                  ) : (
                    <HiOutlineClipboard className="text-[18px]" />
                  )}
                </button>
              </div>
              <button
                type="button"
                onClick={() => setNewToken(null)}
                className="mt-4 w-full py-2.5 rounded-[10px] text-[13px] font-semibold cursor-pointer border"
                style={{ borderColor: 'var(--border)', background: 'var(--surface-2)', color: 'var(--text-primary)' }}
              >
                Done — I saved my token
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
