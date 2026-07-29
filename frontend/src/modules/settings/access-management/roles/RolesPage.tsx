import {useEffect, useMemo, useState} from 'react'
import {useShallow} from 'zustand/react/shallow'
import {
    HiOutlineExclamationCircle,
    HiOutlineKey,
    HiOutlineLockClosed,
    HiOutlineMagnifyingGlass,
    HiOutlinePencilSquare,
    HiOutlinePlus,
    HiOutlineTrash,
    HiOutlineUserGroup,
} from 'react-icons/hi2'
import useAccessManagementStore from '../store'
import {useI18n} from '../../../../infra/locales/I18nContext'
import EmptyState from '../../../../infra/shared/components/EmptyState'
import type {PermissionResponse, RoleCreate, RoleResponse, RoleUpdate} from '../../../../api/generated'

const ROLE_COLORS: Record<string, { bg: string; text: string }> = {
    admin: {bg: 'rgba(124,58,237,0.1)', text: '#7C3AED'},
    teacher: {bg: 'rgba(59,130,246,0.1)', text: '#2563EB'},
    student: {bg: 'rgba(34,197,94,0.1)', text: '#16A34A'},
    staff: {bg: 'rgba(249,115,22,0.1)', text: '#EA580C'},
}

function RoleBadge({role}: { role: string }) {
    const c = ROLE_COLORS[role] ?? {bg: 'rgba(100,116,139,0.1)', text: '#64748B'}
    return (
        <span
            className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold capitalize"
            style={{background: c.bg, color: c.text}}
        >
      {role}
    </span>
    )
}

interface RoleForm {
    name: string
    description: string
}

function RoleEditModal({
                           role,
                           permissions,
                           onClose,
                           onSave,
                       }: {
    role?: RoleResponse
    permissions: PermissionResponse[]
    onClose: () => void
    onSave: (form: RoleForm, selectedCodes: string[]) => Promise<void>
}) {
    const {t} = useI18n()
    const isCreate = !role
    const isSystem = role?.is_system ?? false

    const [form, setForm] = useState<RoleForm>({
        name: role?.name ?? '',
        description: role?.description ?? '',
    })
    const [selectedCodes, setSelectedCodes] = useState<Set<string>>(
        new Set(role?.permissions.map((p) => p.code) ?? [])
    )
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [search, setSearch] = useState('')

    const groupedPermissions = useMemo(() => {
        const q = search.trim().toLowerCase()
        const filtered = q
            ? permissions.filter(
                (p) =>
                    p.name.toLowerCase().includes(q) ||
                    p.code.toLowerCase().includes(q) ||
                    (p.module ?? '').toLowerCase().includes(q),
            )
            : permissions
        const groups: Record<string, PermissionResponse[]> = {}
        for (const p of filtered) {
            const module = p.module ?? 'General'
            if (!groups[module]) groups[module] = []
            groups[module].push(p)
        }
        return groups
    }, [permissions, search])

    const toggleCode = (code: string) => {
        setSelectedCodes((prev) => {
            const next = new Set(prev)
            if (next.has(code)) next.delete(code)
            else next.add(code)
            return next
        })
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)
        setSubmitting(true)
        try {
            await onSave(form, Array.from(selectedCodes))
            onClose()
        } catch (err: any) {
            setError(err?.message || 'Failed to save role')
        } finally {
            setSubmitting(false)
        }
    }

    const inputClass =
        'w-full px-3 py-2 bg-surface-2 border border-bd rounded-lg text-primary text-sm focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20'

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
            <div
                className="bg-surface rounded-2xl border border-bd shadow-elevated w-[95%] max-w-6xl max-h-[90vh] overflow-hidden flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div
                    className="px-6 py-4 flex items-center justify-between shrink-0"
                    style={{background: 'linear-gradient(135deg, var(--navy) 0%, var(--navy-mid) 100%)'}}
                >
                    <div>
                        <p className="text-[13px] font-bold text-white">
                            {isCreate ? t('common.create') : t('common.edit')} {t('nav.accessManagement.roles')}
                        </p>
                        <p className="text-[11px] text-white/50 mt-px">
                            {isCreate ? t('common.fillFieldsHint') : `${role?.name} · ID ${role?.id}`}
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
                <div className="p-6 overflow-y-auto flex-1">
                    <form id="role-form" onSubmit={handleSubmit} className="flex flex-col gap-5">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-secondary mb-1">
                                    {t('common.name')}
                                </label>
                                <input
                                    type="text"
                                    value={form.name}
                                    onChange={(e) => setForm((p) => ({...p, name: e.target.value}))}
                                    required
                                    disabled={isSystem}
                                    className={`${inputClass} ${isSystem ? 'opacity-60 cursor-not-allowed' : ''}`}
                                />
                                {isSystem && (
                                    <p className="text-[11px] text-muted mt-1 flex items-center gap-1">
                                        <HiOutlineLockClosed className="text-[11px]"/>
                                        System roles cannot be renamed
                                    </p>
                                )}
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-secondary mb-1">
                                    {t('common.description')}
                                </label>
                                <input
                                    type="text"
                                    value={form.description}
                                    onChange={(e) => setForm((p) => ({...p, description: e.target.value}))}
                                    className={inputClass}
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-secondary mb-2">
                                Permissions
                            </label>
                            <div className="relative mb-3">
                                <HiOutlineMagnifyingGlass
                                    className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-[16px]"/>
                                <input
                                    type="text"
                                    placeholder={t('common.search')}
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    className="w-full pl-9 pr-3 py-2 bg-surface-2 border border-bd rounded-lg text-primary text-sm focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
                                />
                            </div>
                            <div className="flex flex-col gap-4">
                                {Object.entries(groupedPermissions).map(([module, perms]) => (
                                    <div key={module}>
                                        <p className="text-[11px] font-bold text-accent uppercase tracking-[0.06em] mb-2">
                                            {module}
                                        </p>
                                        <div
                                            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
                                            {perms.map((p) => (
                                                <label
                                                    key={p.code}
                                                    className="flex items-start gap-2 p-2 rounded-lg border border-bd bg-surface-2 cursor-pointer hover:bg-surface transition-colors"
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedCodes.has(p.code)}
                                                        onChange={() => toggleCode(p.code)}
                                                        className="mt-0.5 accent-accent shrink-0"
                                                    />
                                                    <div className="min-w-0">
                                                        <p className="text-sm font-medium text-primary truncate">{p.name}</p>
                                                        <p className="text-[11px] text-muted truncate">{p.code}</p>
                                                    </div>
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                                {Object.keys(groupedPermissions).length === 0 && (
                                    <EmptyState title={t('common.noRecords')} icon={<HiOutlineKey/>} bare/>
                                )}
                            </div>
                        </div>

                        {error && (
                            <div
                                className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20">
                                <HiOutlineExclamationCircle className="text-red-500 text-[15px] mt-px shrink-0"/>
                                <p className="text-sm text-red-500">{error}</p>
                            </div>
                        )}
                    </form>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 flex justify-end gap-2 border-t border-bd shrink-0">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 rounded-[9px] text-sm font-semibold text-secondary bg-surface-2 border border-bd hover:bg-surface transition-colors cursor-pointer font-sans"
                    >
                        {t('common.cancel')}
                    </button>
                    <button
                        type="submit"
                        form="role-form"
                        disabled={submitting}
                        className="px-4 py-2 rounded-[9px] text-sm font-semibold text-white bg-accent hover:opacity-90 transition-opacity border-none cursor-pointer font-sans disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {submitting ? 'Saving…' : t('common.save')}
                    </button>
                </div>
            </div>
        </div>
    )
}

export default function RolesPage() {
    const {
        roles,
        permissions,
        fetchRoles,
        fetchPermissions,
        createRole,
        updateRole,
        deleteRole,
        updateRolePermissions,
        loading,
        error,
        clearError
    } =
        useAccessManagementStore(
            useShallow((s) => ({
                roles: s.roles,
                permissions: s.permissions,
                fetchRoles: s.fetchRoles,
                fetchPermissions: s.fetchPermissions,
                createRole: s.createRole,
                updateRole: s.updateRole,
                deleteRole: s.deleteRole,
                updateRolePermissions: s.updateRolePermissions,
                loading: s.loading,
                error: s.error,
                clearError: s.clearError,
            })),
        )
    const [editingRole, setEditingRole] = useState<RoleResponse | undefined>(undefined)
    const [showCreate, setShowCreate] = useState(false)
    const [deleteConfirm, setDeleteConfirm] = useState<RoleResponse | null>(null)
    const {t} = useI18n()

    useEffect(() => {
        fetchRoles()
        fetchPermissions()
    }, [fetchRoles, fetchPermissions])

    const handleSave = async (form: RoleForm, selectedCodes: string[]) => {
        if (editingRole) {
            // Update metadata
            const payload: RoleUpdate = {}
            if (form.name !== editingRole.name) payload.name = form.name
            if (form.description !== (editingRole.description ?? '')) payload.description = form.description
            if (Object.keys(payload).length > 0) {
                await updateRole(editingRole.id, payload)
            }
            // Update permissions
            const currentCodes = new Set(editingRole.permissions.map((p) => p.code))
            const newCodes = new Set(selectedCodes)
            const changed =
                currentCodes.size !== newCodes.size ||
                ![...currentCodes].every((c) => newCodes.has(c))
            if (changed) {
                await updateRolePermissions(editingRole.id, selectedCodes)
            }
        } else {
            const payload: RoleCreate = {
                name: form.name,
                description: form.description || undefined,
            }
            await createRole(payload)
            // After creating, we need to update permissions for the newly created role.
            // Since createRole doesn't return the role in a predictable shape through the store,
            // we rely on fetchRoles having run. We find the role by name.
            const newRole = useAccessManagementStore.getState().roles.find((r) => r.name === form.name)
            if (newRole && selectedCodes.length > 0) {
                await updateRolePermissions(newRole.id, selectedCodes)
            }
        }
    }

    const handleDelete = async (role: RoleResponse) => {
        try {
            await deleteRole(role.id)
            setDeleteConfirm(null)
        } catch {
            // Error is stored in store.error
        }
    }

    return (
        <div className={'h-full flex flex-col overflow-y-auto'}>
            <div className="flex justify-end mb-4">
                <button
                    onClick={() => setShowCreate(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-[9px] text-sm font-semibold text-white bg-accent hover:opacity-90 transition-opacity border-none cursor-pointer font-sans"
                >
                    <HiOutlinePlus className="text-[15px]"/>
                    {t('common.addNew')}
                </button>
            </div>

            {error && (
                <div
                    className="mb-4 flex items-start gap-2 px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20">
                    <HiOutlineExclamationCircle className="text-red-500 text-[15px] mt-px shrink-0"/>
                    <p className="text-sm text-red-500 flex-1">{error}</p>
                    <button onClick={clearError} className="text-red-500 text-xs font-bold uppercase tracking-wider">
                        Dismiss
                    </button>
                </div>
            )}

            {/* Table */}
            <div className="card p-0 overflow-auto">
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                        <thead>
                        <tr className="border-b border-bd" style={{background: 'var(--navy)'}}>
                            {['ID', t('common.name'), t('common.description'), 'System', 'Permissions', t('common.actions')].map((h) => (
                                <th
                                    key={h}
                                    className="px-4 py-3 text-start text-[11px] font-bold text-white/60 uppercase tracking-[0.06em]"
                                >
                                    {h}
                                </th>
                            ))}
                        </tr>
                        </thead>
                        <tbody className="divide-y divide-bd">
                        {roles.map((r) => (
                            <tr key={r.id} className="hover:bg-surface-2 transition-colors duration-100">
                                <td className="px-4 py-3 text-sm text-muted">{r.id}</td>
                                <td className="px-4 py-3 text-sm font-semibold text-primary">
                                    <div className="flex items-center gap-2">
                                        <RoleBadge role={r.name}/>
                                        {r.is_system && (
                                            <span title="System role">
                          <HiOutlineLockClosed className="text-muted text-[12px]"/>
                        </span>
                                        )}
                                    </div>
                                </td>
                                <td className="px-4 py-3 text-sm text-secondary">{r.description || '—'}</td>
                                <td className="px-4 py-3">
                                    {r.is_system ? (
                                        <span
                                            className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-600">
                        System
                      </span>
                                    ) : (
                                        <span className="text-muted text-sm">—</span>
                                    )}
                                </td>
                                <td className="px-4 py-3 text-sm text-muted">{r.permissions.length}</td>
                                <td className="px-4 py-3">
                                    <div className="flex items-center gap-2">
                                        <button
                                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[7px] text-xs font-semibold bg-accent text-white hover:opacity-90 transition-opacity border-none cursor-pointer font-sans"
                                            onClick={() => setEditingRole(r)}
                                        >
                                            <HiOutlinePencilSquare className="text-[13px]"/>
                                            {t('common.edit')}
                                        </button>
                                        {!r.is_system && (
                                            <button
                                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[7px] text-xs font-semibold bg-red-500 text-white hover:opacity-90 transition-opacity border-none cursor-pointer font-sans"
                                                onClick={() => setDeleteConfirm(r)}
                                            >
                                                <HiOutlineTrash className="text-[13px]"/>
                                                {t('common.delete')}
                                            </button>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {roles.length === 0 && (
                            <tr>
                                <td colSpan={6}>
                                    <EmptyState
                                        title={t('common.noRecords')}
                                        description={t('empty.roles.description')}
                                        icon={<HiOutlineUserGroup/>}
                                        bare
                                    />
                                </td>
                            </tr>
                        )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modals */}
            {(editingRole || showCreate) && (
                <RoleEditModal
                    role={editingRole}
                    permissions={permissions}
                    onClose={() => {
                        setEditingRole(undefined)
                        setShowCreate(false)
                    }}
                    onSave={handleSave}
                />
            )}

            {deleteConfirm && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
                     onClick={() => setDeleteConfirm(null)}>
                    <div
                        className="bg-surface rounded-2xl border border-bd shadow-elevated w-[90%] max-w-md p-6"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-start gap-3 mb-4">
                            <div className="p-2 rounded-full bg-red-500/10">
                                <HiOutlineExclamationCircle className="text-red-500 text-xl"/>
                            </div>
                            <div>
                                <p className="text-base font-bold text-primary">{t('common.confirmDelete')}</p>
                                <p className="text-sm text-secondary mt-1">
                                    Role <strong>{deleteConfirm.name}</strong> will be permanently removed.
                                </p>
                            </div>
                        </div>
                        <div className="flex justify-end gap-2">
                            <button
                                onClick={() => setDeleteConfirm(null)}
                                className="px-4 py-2 rounded-[9px] text-sm font-semibold text-secondary bg-surface-2 border border-bd hover:bg-surface transition-colors cursor-pointer font-sans"
                            >
                                {t('common.cancel')}
                            </button>
                            <button
                                onClick={() => handleDelete(deleteConfirm)}
                                disabled={loading}
                                className="px-4 py-2 rounded-[9px] text-sm font-semibold text-white bg-red-500 hover:opacity-90 transition-opacity border-none cursor-pointer font-sans disabled:opacity-50"
                            >
                                {loading ? 'Deleting…' : t('common.delete')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
