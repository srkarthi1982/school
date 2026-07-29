import { useEffect } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { HiOutlineBolt, HiOutlinePlay } from 'react-icons/hi2'
import SectionHeader from '../../../../infra/shared/components/SectionHeader'
import { useI18n } from '../../../../infra/locales/I18nContext'
import { useToast } from '../../../../infra/shared/store/useToastStore'
import useRagIngestionStore from './store'

function Chip({ label, value }: { label: string; value: number }) {
  return (
    <div className="card px-4 py-3">
      <p className="text-[12px] text-muted">{label}</p>
      <p className="text-xl font-bold text-primary mt-0.5">{value}</p>
    </div>
  )
}

export default function RagIngestionPage() {
  const { t } = useI18n()
  const showToast = useToast()
  const { progress, starting, fetchProgress, start } = useRagIngestionStore(
    useShallow((s) => ({
      progress: s.progress,
      starting: s.starting,
      fetchProgress: s.fetchProgress,
      start: s.start,
    })),
  )

  useEffect(() => {
    fetchProgress()
    const id = setInterval(fetchProgress, 2000)
    return () => clearInterval(id)
  }, [fetchProgress])

  // The sweep is fire-and-forget and often finishes between two polls, so the
  // running pill alone can flash by unseen. Acknowledge the click itself.
  const onStart = async () => {
    try {
      const result = await start()
      if (result.status === 'scheduled') {
        showToast.success({ title: t('ragAdmin.startQueued') })
      } else {
        showToast.error({
          title: t('ragAdmin.startNotStarted'),
          body: result.reason ?? undefined,
        })
      }
    } catch {
      showToast.error({ title: t('ragAdmin.startFailed') })
    }
  }

  const p = progress
  const total = p?.total ?? 0
  const indexed = p?.indexed ?? 0
  const pct = total > 0 ? Math.min(100, Math.round((indexed / total) * 100)) : 0
  const running = !!p?.running

  const lastIndexed = p?.last_indexed_at
    ? new Date(p.last_indexed_at).toLocaleString()
    : t('ragAdmin.never')

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        icon={<HiOutlineBolt />}
        title={t('ragAdmin.ingestionTitle')}
        description={t('ragAdmin.ingestionDesc')}
        actions={
          <button
            className="inline-flex items-center gap-1.5 bg-accent text-white text-[13px] font-semibold px-4 py-2 rounded-lg hover:opacity-90 disabled:opacity-50"
            disabled={starting || running}
            onClick={onStart}
          >
            <HiOutlinePlay className="text-[15px]" />
            {running ? t('ragAdmin.running') : t('ragAdmin.startIngest')}
          </button>
        }
      />

      <div className="card px-5 py-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[13px] font-semibold text-secondary">
            {t('ragAdmin.progress')}
          </span>
          <span className="text-[13px] text-muted">
            {indexed} / {total} ({pct}%)
          </span>
        </div>
        <div className="h-2.5 w-full rounded-full overflow-hidden bg-surface-2">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${pct}%`, background: 'var(--accent)' }}
          />
        </div>
        <div className="flex items-center gap-2 mt-3 text-[12px]">
          <span
            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full font-semibold"
            style={{
              background: running ? 'var(--accent-light)' : 'var(--surface-2)',
              color: running ? 'var(--accent)' : 'var(--text-muted)',
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: running ? 'var(--accent)' : 'var(--text-muted)' }}
            />
            {running ? t('ragAdmin.running') : t('ragAdmin.idle')}
          </span>
          <span className="text-muted">
            {t('ragAdmin.lastIndexed')}: {lastIndexed}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Chip label={t('ragAdmin.pending')} value={p?.pending ?? 0} />
        <Chip label={t('ragAdmin.indexing')} value={p?.indexing ?? 0} />
        <Chip label={t('ragAdmin.errorCount')} value={p?.error ?? 0} />
        <Chip label={t('ragAdmin.orphanBindings')} value={p?.orphan_bindings ?? 0} />
        <Chip label={t('ragAdmin.inFlight')} value={p?.in_flight ?? 0} />
      </div>

      {!!p?.errors?.length && (
        <div className="card px-5 py-4">
          <p className="text-[12px] font-semibold text-secondary mb-2">
            {t('ragAdmin.errors')}
          </p>
          <div className="flex flex-col divide-y divide-[var(--border)]">
            {p.errors.map((e) => (
              <div key={`${e.source_type}:${e.source_id}`} className="min-w-0 py-2">
                <p className="text-[13px] text-primary">
                  {e.source_type} · {e.source_id}{' '}
                  <span className="text-muted">({e.attempts}×)</span>
                </p>
                <p className="text-[12px] text-[var(--danger)] break-words">{e.error}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
