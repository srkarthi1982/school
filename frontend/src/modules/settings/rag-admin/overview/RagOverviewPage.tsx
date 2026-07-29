import { useEffect } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { HiOutlineChartBar } from 'react-icons/hi2'
import SectionHeader from '../../../../infra/shared/components/SectionHeader'
import { useI18n } from '../../../../infra/locales/I18nContext'
import useRagOverviewStore from './store'

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="card px-5 py-4">
      <p className="text-[12px] text-muted">{label}</p>
      <p className="text-2xl font-bold text-primary mt-1">{value}</p>
    </div>
  )
}

function Breakdown({ title, data }: { title: string; data: Record<string, number> }) {
  const entries = Object.entries(data ?? {})
  return (
    <div className="card px-5 py-4">
      <p className="text-[12px] font-semibold text-secondary mb-2">{title}</p>
      {entries.length === 0 ? (
        <p className="text-[13px] text-muted">—</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {entries.map(([k, v]) => (
            <li key={k} className="flex items-center justify-between text-[13px]">
              <span className="text-secondary capitalize">{k.replace(/_/g, ' ')}</span>
              <span className="font-semibold text-primary">{v}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function RagOverviewPage() {
  const { t } = useI18n()
  const { stats, loading, fetch } = useRagOverviewStore(
    useShallow((s) => ({ stats: s.stats, loading: s.loading, fetch: s.fetch })),
  )

  useEffect(() => {
    fetch()
  }, [fetch])

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        icon={<HiOutlineChartBar />}
        title={t('ragAdmin.overviewTitle')}
        description={t('ragAdmin.overviewDesc')}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label={t('ragAdmin.totalChunks')} value={stats?.total_chunks ?? (loading ? '…' : 0)} />
        <StatCard
          label={t('ragAdmin.courseMaterial')}
          value={stats?.documents?.course_material ?? 0}
        />
        <StatCard label={t('ragAdmin.library')} value={stats?.documents?.library ?? 0} />
        <StatCard
          label={t('ragAdmin.documents')}
          value={
            (stats?.documents?.course_material ?? 0) + (stats?.documents?.library ?? 0)
          }
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Breakdown title={t('ragAdmin.bySource')} data={stats?.chunks_by_source ?? {}} />
        <Breakdown title={t('ragAdmin.ingestionStatus')} data={stats?.ingestion_by_status ?? {}} />
      </div>

      <div className="card px-5 py-4">
        <p className="text-[12px] font-semibold text-secondary mb-2">{t('ragAdmin.errors')}</p>
        {!stats?.errors?.length ? (
          <p className="text-[13px] text-muted">{t('ragAdmin.noErrors')}</p>
        ) : (
          <div className="flex flex-col divide-y divide-[var(--border)]">
            {stats.errors.map((e) => (
              <div
                key={`${e.source_type}:${e.source_id}`}
                className="flex items-start justify-between gap-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-[13px] text-primary">
                    {e.source_type} · {e.source_id}{' '}
                    <span className="text-muted">({e.attempts}×)</span>
                  </p>
                  <p className="text-[12px] text-[var(--danger)] break-words">{e.error}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
