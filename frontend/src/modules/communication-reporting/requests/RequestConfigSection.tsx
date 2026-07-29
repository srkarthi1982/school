import { useEffect, useState } from 'react'
import { getRequestConfig, updateRequestConfig } from './requests-api'

export default function RequestConfigSection() {
  const [days, setDays] = useState<number>(3)
  const [original, setOriginal] = useState<number>(3)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    getRequestConfig()
      .then((cfg) => {
        if (!alive) return
        setDays(cfg.overdue_after_days)
        setOriginal(cfg.overdue_after_days)
        setSavedAt(cfg.updated_at)
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : 'Failed to load')
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [])

  const dirty = days !== original

  const handleSave = async () => {
    if (!dirty || saving) return
    setSaving(true)
    setError(null)
    try {
      const cfg = await updateRequestConfig(days)
      setOriginal(cfg.overdue_after_days)
      setSavedAt(cfg.updated_at)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="card px-6 py-4 flex flex-col gap-3 max-w-md">
      <div>
        <p className="text-[11px] font-bold text-muted tracking-[0.07em] uppercase mb-0.5">
          Overdue Threshold
        </p>
        <p className="text-[12.5px] text-secondary">
          Admins are notified when a request stays unresolved past this many days.
        </p>
      </div>

      {loading ? (
        <p className="text-[12px] text-muted">Loading…</p>
      ) : (
        <>
          <label className="flex items-center gap-3">
            <input
              type="number"
              min={1}
              max={365}
              value={days}
              onChange={(e) => setDays(Math.max(1, Math.min(365, Number(e.target.value) || 1)))}
              className="w-24 rounded-[10px] border bg-[var(--surface-2)] px-3 py-2 text-[13px] text-primary focus:outline-none focus:border-[var(--accent)]"
              style={{ borderColor: 'var(--border)' }}
            />
            <span className="text-[12.5px] text-secondary">days</span>
          </label>

          {error && <p className="text-[12px] text-red-600">{error}</p>}

          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={!dirty || saving}
              className="px-3 py-1.5 rounded-[8px] text-[12px] font-semibold text-white cursor-pointer disabled:opacity-50"
              style={{ background: 'var(--accent)' }}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            {savedAt && !dirty && (
              <span className="text-[11px] text-muted">
                Last saved {new Date(savedAt).toLocaleString()}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  )
}
