import {useEffect} from 'react'
import {useShallow} from 'zustand/react/shallow'
import {HiOutlineKey} from 'react-icons/hi2'
import useAccessManagementStore from '../store'
import {useI18n} from '../../../../infra/locales/I18nContext'
import EmptyState from '../../../../infra/shared/components/EmptyState'

export default function PermissionsPage() {
    const {permissions, fetchPermissions, loading} = useAccessManagementStore(
        useShallow((s) => ({
            permissions: s.permissions,
            fetchPermissions: s.fetchPermissions,
            loading: s.loading,
        })),
    )
    const {t} = useI18n()

    useEffect(() => {
        fetchPermissions()
    }, [fetchPermissions])

    const grouped = permissions.reduce<Record<string, typeof permissions>>((acc, p) => {
        const module = p.module ?? 'General'
        if (!acc[module]) acc[module] = []
        acc[module].push(p)
        return acc
    }, {})

    return (
        <div className={'h-full flex flex-col overflow-y-auto'}>
        <div className="flex flex-col gap-6">
            {Object.entries(grouped).map(([module, perms]) => (
                <div key={module} className="card p-0 overflow-hidden">
                    <div
                        className="px-4 py-3 border-b border-bd"
                        style={{background: 'var(--navy)'}}
                    >
                        <p className="text-[11px] font-bold text-white/60 uppercase tracking-[0.06em]">
                            {module}
                        </p>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse">
                            <thead>
                            <tr className="border-b border-bd">
                                <th className="px-4 py-2.5 text-start text-[11px] font-bold text-secondary uppercase tracking-[0.06em]">
                                    {t('common.code')}
                                </th>
                                <th className="px-4 py-2.5 text-start text-[11px] font-bold text-secondary uppercase tracking-[0.06em]">
                                    {t('common.name')}
                                </th>
                                <th className="px-4 py-2.5 text-start text-[11px] font-bold text-secondary uppercase tracking-[0.06em]">
                                    {t('common.description')}
                                </th>
                            </tr>
                            </thead>
                            <tbody className="divide-y divide-bd">
                            {perms.map((p) => (
                                <tr key={p.id} className="hover:bg-surface-2 transition-colors duration-100">
                                    <td className="px-4 py-3 text-sm font-mono text-muted">{p.code}</td>
                                    <td className="px-4 py-3 text-sm font-medium text-primary">{p.name}</td>
                                    <td className="px-4 py-3 text-sm text-secondary">{p.description || '—'}</td>
                                </tr>
                            ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            ))}

            {permissions.length === 0 && !loading && (
                <EmptyState
                    fill
                    icon={<HiOutlineKey/>}
                    title={t('common.noRecords')}
                    description={t('empty.permissions.description')}
                />
            )}
        </div>
        </div>
    )
}
