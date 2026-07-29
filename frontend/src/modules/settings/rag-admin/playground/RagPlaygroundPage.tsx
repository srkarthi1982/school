import { useShallow } from 'zustand/react/shallow'
import { HiOutlineMagnifyingGlass } from 'react-icons/hi2'
import SectionHeader from '../../../../infra/shared/components/SectionHeader'
import { useI18n } from '../../../../infra/locales/I18nContext'
import useRagPlaygroundStore, { type DebugHit } from './store'

function Badge({ label, value }: { label: string; value: string | number | null }) {
  if (value === null || value === undefined) return null
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold"
      style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}
    >
      {label}: {value}
    </span>
  )
}

function HitCard({ hit }: { hit: DebugHit }) {
  const { t } = useI18n()
  return (
    <div className="card px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-primary truncate">{hit.document_title}</p>
          <p className="text-[11px] text-muted capitalize">
            {hit.source_type.replace(/_/g, ' ')}
            {hit.page_no != null ? ` · ${t('ragAdmin.page')} ${hit.page_no}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-1 justify-end shrink-0">
          <Badge label={t('ragAdmin.rrf')} value={hit.rrf_score != null ? hit.rrf_score.toFixed(4) : null} />
          <Badge label={t('ragAdmin.cosine')} value={hit.cosine != null ? hit.cosine.toFixed(3) : null} />
          <Badge label={t('ragAdmin.denseRank')} value={hit.dense_rank} />
          <Badge label={t('ragAdmin.kwRank')} value={hit.kw_rank} />
        </div>
      </div>
      <p className="text-[13px] text-secondary mt-2 line-clamp-4 whitespace-pre-wrap">{hit.content}</p>
    </div>
  )
}

export default function RagPlaygroundPage() {
  const { t } = useI18n()
  const s = useRagPlaygroundStore(
    useShallow((st) => ({
      query: st.query,
      topK: st.topK,
      hybrid: st.hybrid,
      scope: st.scope,
      hits: st.hits,
      loading: st.loading,
      ran: st.ran,
      patch: st.patch,
      run: st.run,
    })),
  )

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        icon={<HiOutlineMagnifyingGlass />}
        title={t('ragAdmin.playgroundTitle')}
        description={t('ragAdmin.playgroundDesc')}
      />

      <div className="card px-5 py-4 flex flex-col gap-3">
        <textarea
          className="bg-surface-2 border border-bd rounded-lg text-[14px] px-3 py-2 text-primary min-h-[64px]"
          placeholder={t('ragAdmin.queryPlaceholder')}
          value={s.query}
          onChange={(e) => s.patch({ query: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) s.run()
          }}
        />
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5 text-[13px] text-secondary">
            {t('ragAdmin.topK')}
            <input
              type="number"
              min={1}
              max={50}
              className="w-16 bg-surface-2 border border-bd rounded-lg px-2 py-1 text-primary"
              value={s.topK}
              onChange={(e) => s.patch({ topK: Math.max(1, Math.min(50, Number(e.target.value) || 8)) })}
            />
          </label>
          <label className="flex items-center gap-1.5 text-[13px] text-secondary">
            <input
              type="checkbox"
              checked={s.hybrid}
              onChange={(e) => s.patch({ hybrid: e.target.checked })}
            />
            {t('ragAdmin.hybrid')}
          </label>
          <label className="flex items-center gap-1.5 text-[13px] text-secondary">
            {t('ragAdmin.scope')}
            <select
              className="bg-surface-2 border border-bd rounded-lg px-2 py-1 text-primary"
              value={s.scope}
              onChange={(e) => s.patch({ scope: e.target.value as 'mine' | 'all' })}
            >
              <option value="mine">{t('ragAdmin.scopeMine')}</option>
              <option value="all">{t('ragAdmin.scopeAll')}</option>
            </select>
          </label>
          <button
            className="ml-auto bg-accent text-white text-[13px] font-semibold px-5 py-2 rounded-lg hover:opacity-90 disabled:opacity-50"
            disabled={s.loading || !s.query.trim()}
            onClick={s.run}
          >
            {s.loading ? '…' : t('ragAdmin.search')}
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {s.hits.map((h) => (
          <HitCard key={h.chunk_id} hit={h} />
        ))}
        {s.ran && !s.hits.length && !s.loading && (
          <p className="text-[13px] text-muted text-center py-6">{t('ragAdmin.noResults')}</p>
        )}
      </div>
    </div>
  )
}
