import {useEffect, useMemo, useState} from 'react'
import {useShallow} from 'zustand/react/shallow'
import {
    HiOutlineChevronDown,
    HiOutlineMagnifyingGlass,
    HiOutlinePencilSquare,
    HiOutlinePlus,
    HiOutlineTrash,
    HiOutlineQuestionMarkCircle,
    HiOutlineSparkles,
    HiOutlineBookOpen,
} from 'react-icons/hi2'
import useAuthStore, {selectUserPermissions} from '../../../infra/auth/useAuthStore'
import {useI18n} from '../../../infra/locales/I18nContext'
import useFaqStore from './faq-store'
import type {FaqEntry} from './faq-types'
import FaqItemModal from './FaqItemModal'
import SectionHeader from '../../../infra/shared/components/SectionHeader'
import EmptyState from '../../../infra/shared/components/EmptyState'

// Highlight a substring inside text, returning a list of ReactNodes.
function highlight(text: string, query: string) {
    const q = query.trim()
    if (!q) return text
    const lower = text.toLowerCase()
    const needle = q.toLowerCase()
    const parts: React.ReactNode[] = []
    let i = 0
    let next = lower.indexOf(needle, i)
    let key = 0
    while (next !== -1) {
        if (next > i) parts.push(text.slice(i, next))
        parts.push(
            <mark
                key={key++}
                className="bg-transparent text-accent font-semibold underline decoration-accent/40 underline-offset-2"
            >
                {text.slice(next, next + needle.length)}
            </mark>,
        )
        i = next + needle.length
        next = lower.indexOf(needle, i)
    }
    if (i < text.length) parts.push(text.slice(i))
    return parts
}

export default function FaqPage() {
    const {t} = useI18n()

    const userPerms = useAuthStore(selectUserPermissions)
    const canWrite = userPerms.has('faq:write')

    const {items, search, setSearch, fetch, remove} = useFaqStore(
        useShallow((s) => ({
            items: s.items,
            search: s.search,
            setSearch: s.setSearch,
            fetch: s.fetch,
            remove: s.remove,
        })),
    )

    useEffect(() => {
        fetch()
    }, [fetch])

    const [openModal, setOpenModal] = useState(false)
    const [editing, setEditing] = useState<FaqEntry | undefined>(undefined)
    const [expandedId, setExpandedId] = useState<number | null>(null)
    const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase()
        return items.filter((it) => {
            if (!q) return true
            return (
                it.question.toLowerCase().includes(q) ||
                it.answer.toLowerCase().includes(q)
            )
        })
    }, [items, search])

    const openCreate = () => {
        setEditing(undefined)
        setOpenModal(true)
    }

    const openEdit = (entry: FaqEntry) => {
        setEditing(entry)
        setOpenModal(true)
    }

    return (
        <div className="flex flex-col gap-3 h-full min-h-0">
            {/* Header */}
            <SectionHeader
                icon={<HiOutlineQuestionMarkCircle />}
                title={t('nav.communicationReport.faq.title')}
                actions={
                    canWrite && (
                        <button
                            onClick={openCreate}
                            className="inline-flex items-center gap-1.5 bg-accent text-white text-sm font-semibold py-[9px] px-4 rounded-[10px] hover:opacity-90 transition-opacity border-none cursor-pointer font-sans shrink-0"
                        >
                            <HiOutlinePlus className="text-[15px]"/>
                            {t('faq.addFaq')}
                        </button>
                    )
                }
            />

            {/* Toolbar: search */}
            <div className="relative">
                <HiOutlineMagnifyingGlass className="absolute start-3 top-1/2 -translate-y-1/2 text-muted text-[15px]"/>
                <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={t('faq.searchPlaceholder')}
                    className="w-full ps-9 pe-3 py-2 bg-surface-2 border border-bd rounded-[10px] text-primary text-sm focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
                />
            </div>


            {/* Accordion list */}
            <div
                className={
                    'card p-0 overflow-hidden ' +
                    (filtered.length === 0 ? 'flex-1 flex flex-col min-h-0' : '')
                }
            >
                {filtered.length === 0 ? (
                    <EmptyState
                        fill
                        bare
                        icon={<HiOutlineQuestionMarkCircle />}
                        title={t('faq.noResults')}
                        description={t('faq.noResultsHint')}
                        hints={[
                            {
                                icon: <HiOutlineMagnifyingGlass />,
                                title: t('empty.faq.searchTitle'),
                                description: t('empty.faq.searchDesc'),
                            },
                            {
                                icon: <HiOutlineBookOpen />,
                                title: t('empty.faq.browseTitle'),
                                description: t('empty.faq.browseDesc'),
                            },
                            {
                                icon: <HiOutlineSparkles />,
                                title: t('empty.faq.currentTitle'),
                                description: t('empty.faq.currentDesc'),
                            },
                        ]}
                    />
                ) : (
                    <ul className="flex flex-col">
                        {filtered.map((it, i) => {
                            const isOpen = expandedId === it.id
                            return (
                                <li key={it.id} className={i > 0 ? 'border-t border-bd' : ''}>
                                    <button
                                        onClick={() => setExpandedId(isOpen ? null : it.id)}
                                        className="w-full text-start px-6 py-3.5 flex items-center gap-3 cursor-pointer hover:bg-surface-2 border-none bg-transparent font-sans"
                                    >
                                        <span
                                            className="flex-1 min-w-0 text-[13.5px] font-semibold text-primary truncate">
                      {highlight(it.question, search)}
                    </span>
                                        <HiOutlineChevronDown
                                            className="text-muted text-[15px] shrink-0 transition-transform"
                                            style={{transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)'}}
                                        />
                                    </button>
                                    {isOpen && (
                                        <div className="px-6 pb-4 pt-1 flex flex-col gap-3">
                                            <p className="text-[13px] text-secondary whitespace-pre-line leading-relaxed">
                                                {highlight(it.answer, search)}
                                            </p>
                                            <div className="flex items-center gap-2 text-[11px] text-muted">
                        <span>
                          {t('faq.lastUpdated')}{' '}
                            {new Date(it.updated_at).toLocaleDateString()}
                        </span>
                                                {canWrite && (
                                                    <div className="flex items-center gap-2 ms-auto">
                                                        <button
                                                            onClick={() => openEdit(it)}
                                                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[7px] text-xs font-semibold bg-accent text-white hover:opacity-90 transition-opacity border-none cursor-pointer font-sans"
                                                        >
                                                            <HiOutlinePencilSquare className="text-[13px]"/>
                                                            {t('common.edit')}
                                                        </button>
                                                        <button
                                                            onClick={() => setConfirmDeleteId(it.id)}
                                                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[7px] text-xs font-semibold bg-red-500 text-white hover:opacity-90 transition-opacity border-none cursor-pointer font-sans"
                                                        >
                                                            <HiOutlineTrash className="text-[13px]"/>
                                                            {t('common.delete')}
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </li>
                            )
                        })}
                    </ul>
                )}
            </div>

            <FaqItemModal
                open={openModal}
                entry={editing}
                onClose={() => setOpenModal(false)}
            />

            {confirmDeleteId && (
                <div
                    className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
                    onClick={() => setConfirmDeleteId(null)}
                >
                    <div
                        className="bg-surface rounded-2xl border border-bd shadow-elevated w-[90%] max-w-md p-6"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <p className="text-base font-bold text-primary">{t('common.confirmDelete')}</p>
                        <p className="text-sm text-secondary mt-2">{t('faq.deleteHint')}</p>
                        <div className="flex justify-end gap-2 mt-5">
                            <button
                                onClick={() => setConfirmDeleteId(null)}
                                className="px-4 py-2 rounded-[9px] text-sm font-semibold text-secondary bg-surface-2 border border-bd hover:bg-surface transition-colors cursor-pointer font-sans"
                            >
                                {t('common.cancel')}
                            </button>
                            <button
                                onClick={async () => {
                                    try {
                                        await remove(confirmDeleteId)
                                    } finally {
                                        setConfirmDeleteId(null)
                                    }
                                }}
                                className="px-4 py-2 rounded-[9px] text-sm font-semibold text-white bg-red-500 hover:opacity-90 transition-opacity border-none cursor-pointer font-sans"
                            >
                                {t('common.delete')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
