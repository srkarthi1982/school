import { useEffect } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { HiOutlineCircleStack, HiOutlineXMark } from 'react-icons/hi2'
import SectionHeader from '../../../../infra/shared/components/SectionHeader'
import Paginator2 from '../../../../infra/shared/components/Paginator2'
import { useI18n } from '../../../../infra/locales/I18nContext'
import useRagChunksStore from './store'

export default function RagChunksPage() {
  const { t } = useI18n()
  const s = useRagChunksStore(
    useShallow((st) => ({
      items: st.items,
      total: st.total,
      page: st.page,
      pageSize: st.pageSize,
      sourceType: st.sourceType,
      q: st.q,
      loading: st.loading,
      detail: st.detail,
      setFilter: st.setFilter,
      fetch: st.fetch,
      openDetail: st.openDetail,
      closeDetail: st.closeDetail,
    })),
  )

  useEffect(() => {
    s.fetch(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.sourceType])

  const pages = Math.max(1, Math.ceil(s.total / s.pageSize))

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        icon={<HiOutlineCircleStack />}
        title={t('ragAdmin.chunksTitle')}
        description={t('ragAdmin.chunksDesc')}
      />

      <div className="flex flex-wrap items-center gap-2">
        <select
          className="bg-surface-2 border border-bd rounded-lg text-[13px] px-3 py-2 text-primary"
          value={s.sourceType}
          onChange={(e) => s.setFilter({ sourceType: e.target.value })}
        >
          <option value="">{t('ragAdmin.allSources')}</option>
          <option value="course_material">{t('ragAdmin.courseMaterial')}</option>
          <option value="library">{t('ragAdmin.library')}</option>
        </select>
        <input
          className="bg-surface-2 border border-bd rounded-lg text-[13px] px-3 py-2 text-primary flex-1 min-w-[180px]"
          placeholder={t('ragAdmin.filterTitle')}
          value={s.q}
          onChange={(e) => s.setFilter({ q: e.target.value })}
          onKeyDown={(e) => e.key === 'Enter' && s.fetch(1)}
        />
        <button
          className="bg-accent text-white text-[13px] font-semibold px-4 py-2 rounded-lg hover:opacity-90"
          onClick={() => s.fetch(1)}
        >
          {t('ragAdmin.search')}
        </button>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-bd" style={{ background: 'var(--navy)' }}>
                {['source', 'title', 'page', 'chunkIndex', 'chars', 'indexedAt'].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-start text-[11px] font-bold text-white/60 uppercase tracking-[0.06em]"
                  >
                    {t(`ragAdmin.${h}` as any)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {s.items.map((c) => (
                <tr
                  key={c.chunk_id}
                  className="border-t border-bd hover:bg-surface-2 cursor-pointer"
                  onClick={() => s.openDetail(c.chunk_id)}
                >
                  <td className="px-4 py-2 text-secondary capitalize">
                    {c.source_type.replace(/_/g, ' ')}
                  </td>
                  <td className="px-4 py-2 text-primary max-w-[280px] truncate">{c.document_title}</td>
                  <td className="px-4 py-2 text-secondary">{c.page_no ?? '—'}</td>
                  <td className="px-4 py-2 text-secondary">{c.chunk_index}</td>
                  <td className="px-4 py-2 text-secondary">{c.content_chars}</td>
                  <td className="px-4 py-2 text-muted">{new Date(c.indexed_at).toLocaleString()}</td>
                </tr>
              ))}
              {!s.items.length && !s.loading && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-muted">
                    {t('ragAdmin.noResults')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Paginator2 is 0-based; the store (like the API) is 1-based. */}
      <Paginator2
        page={s.page - 1}
        totalPages={pages}
        pageSize={s.pageSize}
        dataLength={s.total}
        onPageChanged={(p) => s.fetch(p + 1)}
      />

      {s.detail && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={s.closeDetail}
        >
          <div
            className="card w-full max-w-2xl max-h-[80vh] overflow-auto p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="min-w-0">
                <h3 className="text-[15px] font-bold text-primary truncate">
                  {s.detail.document_title}
                </h3>
                <p className="text-[12px] text-muted">
                  {t('ragAdmin.page')} {s.detail.page_no ?? '—'} · {t('ragAdmin.chunkIndex')}{' '}
                  {s.detail.chunk_index} · {s.detail.content_chars} {t('ragAdmin.chars')}
                </p>
              </div>
              <button className="text-muted hover:text-primary" onClick={s.closeDetail}>
                <HiOutlineXMark className="text-[20px]" />
              </button>
            </div>
            <pre className="text-[13px] text-secondary whitespace-pre-wrap break-words font-sans">
              {s.detail.content}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}
