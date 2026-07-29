import {useCallback, useEffect, useState, type FormEvent} from 'react'
import {
    HiMiniChevronUpDown,
    HiOutlineChevronDown,
    HiOutlineChevronUp,
    HiOutlineEye,
} from 'react-icons/hi2'
import {listAuditLogsApiV1AuditLogsGet} from '../../../api/generated'
import type {AuditLogResponse} from '../../../api/generated'
import {useI18n} from '../../../infra/locales/I18nContext'
import SectionHeader from '../../../infra/shared/components/SectionHeader'
import EmptyState from '../../../infra/shared/components/EmptyState'
import Paginator2 from '../../../infra/shared/components/Paginator2'

// user_name is populated by the backend join; regenerate the API client to
// fold it into AuditLogResponse and drop this extension.
type AuditRow = AuditLogResponse & { user_name?: string | null }

const OPERATION_COLORS: Record<string, { bg: string; text: string }> = {
    INSERT: {bg: 'rgba(34,197,94,0.1)', text: '#16A34A'},
    UPDATE: {bg: 'rgba(59,130,246,0.1)', text: '#2563EB'},
    DELETE: {bg: 'rgba(220,38,38,0.1)', text: '#DC2626'},
}

function OperationBadge({operation}: { operation: string }) {
    const c = OPERATION_COLORS[operation] ?? {bg: 'rgba(100,116,139,0.1)', text: '#64748B'}
    return (
        <span
            className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold"
            style={{background: c.bg, color: c.text}}
        >
            {operation}
        </span>
    )
}

function formatTimestamp(ts: string): string {
    const d = new Date(ts)
    return isNaN(d.getTime()) ? ts : d.toLocaleString()
}

function formatValue(v: unknown): string {
    if (v === null || v === undefined || v === '') return '—'
    if (typeof v === 'object') return JSON.stringify(v)
    return String(v)
}

function DetailModal({row, onClose, systemLabel}: {
    row: AuditRow
    onClose: () => void
    systemLabel: string
}) {
    const changed = (row.changed_fields ?? []) as string[]
    const before = row.before_data ?? {}
    const after = row.after_data ?? {}

    // UPDATE → show only changed fields; INSERT → all after values;
    // DELETE → all before values.
    const fields =
        row.operation === 'UPDATE'
            ? changed
            : Object.keys(row.operation === 'INSERT' ? after : before)

    return (
        <div
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
            onClick={onClose}
        >
            <div
                className="bg-surface rounded-2xl border border-bd shadow-elevated w-[90%] sm:w-[60vw] max-h-[85vh] overflow-hidden flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div
                    className="px-6 py-4 flex items-center justify-between shrink-0"
                    style={{background: 'linear-gradient(135deg, var(--navy) 0%, var(--navy-mid) 100%)'}}
                >
                    <div>
                        <p className="text-[13px] font-bold text-white">
                            {row.operation} &middot; {row.table_name} #{row.row_id}
                        </p>
                        <p className="text-[11px] text-white/50 mt-px">
                            {row.user_name ?? (row.user_id != null ? `User ${row.user_id}` : systemLabel)}
                            {' '}&middot; {formatTimestamp(row.timestamp)} &middot; Log ID {row.id}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="text-white/50 hover:text-white text-xl leading-none border-none bg-transparent cursor-pointer"
                    >
                        &times;
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 overflow-y-auto flex-1 flex flex-col gap-4">
                    {fields.length > 0 ? (
                        <table className="w-full border-collapse">
                            <thead>
                            <tr className="border-b border-bd">
                                <th className="px-3 py-2 text-start text-[11px] font-bold text-muted uppercase tracking-[0.06em]">Field</th>
                                {row.operation !== 'INSERT' && (
                                    <th className="px-3 py-2 text-start text-[11px] font-bold text-muted uppercase tracking-[0.06em]">Before</th>
                                )}
                                {row.operation !== 'DELETE' && (
                                    <th className="px-3 py-2 text-start text-[11px] font-bold text-muted uppercase tracking-[0.06em]">After</th>
                                )}
                            </tr>
                            </thead>
                            <tbody className="divide-y divide-bd">
                            {fields.map((f) => (
                                <tr key={f}>
                                    <td className="px-3 py-2 text-sm font-semibold text-primary whitespace-nowrap align-top">{f}</td>
                                    {row.operation !== 'INSERT' && (
                                        <td className="px-3 py-2 text-sm text-secondary break-all align-top">
                                            {formatValue((before as Record<string, unknown>)[f])}
                                        </td>
                                    )}
                                    {row.operation !== 'DELETE' && (
                                        <td className="px-3 py-2 text-sm text-primary break-all align-top">
                                            {formatValue((after as Record<string, unknown>)[f])}
                                        </td>
                                    )}
                                </tr>
                            ))}
                            </tbody>
                        </table>
                    ) : (
                        <p className="text-sm text-muted">No field data recorded.</p>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 flex justify-end border-t border-bd shrink-0">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 rounded-[9px] text-sm font-semibold text-secondary bg-surface-2 border border-bd hover:bg-surface transition-colors cursor-pointer font-sans"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    )
}

type SortKey = 'id' | 'table_name' | 'operation' | 'user_id' | 'timestamp'

const PAGE_SIZE = 15

export default function AuditLogPage() {
    const {t} = useI18n()
    const [rows, setRows] = useState<AuditRow[]>([])
    const [total, setTotal] = useState(0)
    const [totalPages, setTotalPages] = useState(1)
    const [page, setPage] = useState(0)
    const [loading, setLoading] = useState(false)
    const [sortKey, setSortKey] = useState<SortKey>('id')
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
    const [detailRow, setDetailRow] = useState<AuditRow | null>(null)

    // Draft filter inputs vs. the applied set the fetch actually uses.
    const [tableFilter, setTableFilter] = useState('')
    const [operationFilter, setOperationFilter] = useState('')
    const [applied, setApplied] = useState({table_name: '', operation: ''})

    useEffect(() => {
        let cancelled = false
        ;(async () => {
            setLoading(true)
            try {
                const {data} = await listAuditLogsApiV1AuditLogsGet({
                    query: {
                        page: page + 1,
                        page_size: PAGE_SIZE,
                        sort_by: sortKey,
                        sort_order: sortDir,
                        table_name: applied.table_name || null,
                        operation: applied.operation || null,
                    },
                })
                if (cancelled) return
                setRows(((data as any)?.data ?? []) as AuditRow[])
                const meta = (data as any)?.meta
                setTotal(meta?.total ?? 0)
                setTotalPages(meta?.pages ?? 1)
            } finally {
                if (!cancelled) setLoading(false)
            }
        })()
        return () => {
            cancelled = true
        }
    }, [page, sortKey, sortDir, applied])

    const applyFilters = (e: FormEvent) => {
        e.preventDefault()
        setPage(0)
        setApplied({table_name: tableFilter.trim(), operation: operationFilter})
    }

    const toggleSort = useCallback((col: SortKey) => {
        setPage(0)
        setSortKey(prev => {
            if (prev === col) {
                setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
            } else {
                setSortDir('asc')
            }
            return col
        })
    }, [])

    const SortIcon = ({col}: { col: SortKey }) => {
        if (sortKey !== col) return <HiMiniChevronUpDown className="text-[14px] text-muted opacity-50"/>
        return sortDir === 'asc' ? <HiOutlineChevronUp className="text-[12px] text-accent"/> :
            <HiOutlineChevronDown className="text-[12px] text-accent"/>
    }

    const inputClass =
        'px-3 py-2 bg-surface-2 border border-bd rounded-lg text-primary text-sm focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20'

    return (
        <div className="flex flex-col gap-5 overflow-hidden h-[100%]">
            <SectionHeader
                eyebrow={t('common.management')}
                title={t('auditLog.title')}
            />

            {/* Filters */}
            <form onSubmit={applyFilters} className="flex flex-wrap items-center gap-2">
                <input
                    type="text"
                    value={tableFilter}
                    onChange={(e) => setTableFilter(e.target.value)}
                    placeholder="Table name"
                    className={inputClass}
                />
                <select
                    value={operationFilter}
                    onChange={(e) => setOperationFilter(e.target.value)}
                    className={inputClass}
                >
                    <option value="">All operations</option>
                    <option value="INSERT">INSERT</option>
                    <option value="UPDATE">UPDATE</option>
                    <option value="DELETE">DELETE</option>
                </select>
                <button
                    type="submit"
                    className="px-4 py-2 rounded-[9px] text-sm font-semibold text-white bg-accent hover:opacity-90 transition-opacity border-none cursor-pointer font-sans"
                >
                    {t('common.search')}
                </button>
            </form>

            {/* Table */}
            <div className="flex flex-col gap-2 overflow-auto h-full">
                <div className="card p-0 h-full overflow-auto">
                    <div className="overflow-auto">
                        <table className="w-full border-collapse">
                            <thead>
                            <tr className="border-b border-bd" style={{background: 'var(--navy)'}}>
                                {[
                                    {key: 'id', label: 'ID'},
                                    {key: 'timestamp', label: 'Timestamp'},
                                    {key: 'user_id', label: 'User'},
                                    {key: 'operation', label: 'Operation'},
                                    {key: 'table_name', label: 'Table'},
                                ].map(k => (
                                    <th key={`header-${k.key}`}
                                        className="px-4 py-3 text-[11px] font-bold text-white/60 tracking-[0.06em] uppercase">
                                        <button onClick={() => toggleSort(k.key as SortKey)} type="button"
                                                className="flex items-center gap-1 hover:text-white transition-colors uppercase">
                                            {k.label}<SortIcon col={k.key as SortKey}/>
                                        </button>
                                    </th>
                                ))}
                                <th className="px-4 py-3 text-start text-[11px] font-bold text-white/60 uppercase tracking-[0.06em]">
                                    Record
                                </th>
                                <th className="px-4 py-3 text-start text-[11px] font-bold text-white/60 uppercase tracking-[0.06em]">
                                    Changed Fields
                                </th>
                                <th className="px-4 py-3 text-center text-[11px] font-bold text-white/60 uppercase tracking-[0.06em]">
                                    Action
                                </th>
                            </tr>
                            </thead>
                            <tbody className="divide-y divide-bd">
                            {rows.map((r) => (
                                <tr key={r.id} className="hover:bg-surface-2 transition-colors duration-100">
                                    <td className="px-4 py-3 text-sm text-muted">{r.id}</td>
                                    <td className="px-4 py-3 text-sm text-secondary whitespace-nowrap">{formatTimestamp(r.timestamp)}</td>
                                    <td className="px-4 py-3 text-sm font-semibold text-primary">
                                        {r.user_name ?? (r.user_id != null
                                            ? `User ${r.user_id}`
                                            : <span className="font-normal text-muted italic">{t('auditLog.system')}</span>)}
                                    </td>
                                    <td className="px-4 py-3"><OperationBadge operation={r.operation}/></td>
                                    <td className="px-4 py-3 text-sm text-primary">{r.table_name}</td>
                                    <td className="px-4 py-3 text-sm text-secondary">#{r.row_id}</td>
                                    <td className="px-4 py-3 text-sm text-secondary">
                                        {r.changed_fields?.length
                                            ? (r.changed_fields as string[]).join(', ')
                                            : '—'}
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex justify-center">
                                            <button
                                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[7px] text-xs font-semibold bg-accent text-white hover:opacity-90 transition-opacity border-none cursor-pointer font-sans"
                                                onClick={() => setDetailRow(r)}
                                                type="button"
                                            >
                                                <HiOutlineEye className="text-[13px]"/>
                                                View
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {!loading && rows.length === 0 && (
                                <tr>
                                    <td colSpan={8}>
                                        <EmptyState title={t('auditLog.noRecords')} bare/>
                                    </td>
                                </tr>
                            )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <Paginator2 page={page} totalPages={totalPages} onPageChanged={setPage}
                        dataLength={total} pageSize={PAGE_SIZE}/>

            {detailRow && (
                <DetailModal row={detailRow} onClose={() => setDetailRow(null)}
                             systemLabel={t('auditLog.system')}/>
            )}
        </div>
    )
}
