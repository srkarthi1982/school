import {useCallback, useEffect, useMemo, useState, type FormEvent} from 'react'
import {useShallow} from 'zustand/react/shallow'
import {
    HiOutlineUserPlus,
    HiOutlinePencilSquare,
    HiOutlineExclamationCircle,
    HiMiniChevronUpDown,
    HiOutlineChevronUp,
    HiOutlineChevronDown,
    HiOutlinePlus
} from 'react-icons/hi2'
import useAdminStore from './store'
import useAuthStore, { selectUserPermissions } from '../../../../infra/auth/useAuthStore'
import {useI18n} from '../../../../infra/locales/I18nContext'
import type {UserCreate, UserResponse} from '../../../../api/generated'
import {client} from '../../../../api/client'
import {useNavigate} from 'react-router-dom'
import DateTimePicker from '../../../../infra/shared/components/DateTimePicker'
import {CountryLookup, CountryProp} from '../../../../infra/shared/components/CountryLookup'
import SearchBar from '../../../../infra/shared/components/SearchBar'
import SectionHeader from '../../../../infra/shared/components/SectionHeader'
import EmptyState from '../../../../infra/shared/components/EmptyState'
import Paginator2 from '../../../../infra/shared/components/Paginator2'
import {Btn} from "../../../profile-general-info/design-system/DesignSystemPage.tsx";
import AddEsnaadUser from './AddEsnaadUser'

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

function getUserRoles(user: UserResponse): string[] {
    return ((user as any).roles as string[] | undefined) ?? []
}

function formatDateString(dateString: string): string {
    const date = new Date(dateString);

    if (isNaN(date.getTime())) {
        throw new Error('Invalid date format');
    }

    // Using UTC to prevent timezone shifting (input has no timezone info)
    const day = String(date.getUTCDate()).padStart(2, '0');
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    const month = months[date.getUTCMonth()];
    const year = date.getUTCFullYear();

    return `${day}-${month}-${year}`;
}

function parseDateStringToISO(d: string) {
    const [day, m, y] = d.split('-');
    const month = String(new Date(`${y}-${['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'].indexOf(m.toUpperCase()) + 1}-01`).getMonth() + 1).padStart(2, '0');
    return `${y}-${month}-${day.padStart(2, '0')}T00:00:00`;
}

interface EditForm {
    email: string
    username: string
    full_name: string
    roles: string[]
    is_active: string
    password: string
}

interface NewForm extends EditForm {
    date_of_birth: string | null | undefined,
    country: string | null | undefined,
    mobile_no: string | null | undefined,
    ext_no: string | null | undefined
}

function EditUserModal({
                           user,
                           onClose,
                           onSave,
                       }: {
    user: UserResponse
    onClose: () => void
    onSave: (form: EditForm) => Promise<void>
}) {
    const [form, setForm] = useState<EditForm>({
        email: user.email,
        username: user.username,
        full_name: user.full_name,
        roles: getUserRoles(user),
        is_active: user.is_active ? 'true' : 'false',
        password: '',
    })
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [availableRoles, setAvailableRoles] = useState<string[]>([])

    const canChangePassword = useMemo(() => 'LDAP' !== user.auth_provider, [user])
    useEffect(() => {
        let cancelled = false
        ;(async () => {
            try {
                const {data} = await (client as any).get({
                    url: '/api/v1/access/roles',
                    headers: {'Content-Type': 'application/json'},
                })
                if (cancelled) return
                const roles = (data as any)?.data as Array<{ name: string }> | undefined
                if (Array.isArray(roles)) {
                    setAvailableRoles(roles.map(r => r.name))
                } else {
                    // Fallback: keep current roles only (admin can still save without modifying)
                    setAvailableRoles(getUserRoles(user))
                }
            } catch {
                if (!cancelled) setAvailableRoles(getUserRoles(user))
            }
        })()
        return () => {
            cancelled = true
        }
    }, [user])

    const updateField = (field: 'email' | 'username' | 'full_name' | 'is_active' | 'password') =>
        (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
            setForm((prev) => ({...prev, [field]: e.target.value}))

    const toggleRole = (roleName: string) => {
        setForm((prev) => {
            const has = prev.roles.includes(roleName)
            return {
                ...prev,
                roles: has ? prev.roles.filter(r => r !== roleName) : [...prev.roles, roleName],
            }
        })
    }

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault()
        setError(null)
        setSubmitting(true)
        try {
            await onSave(form)
            onClose()
        } catch (err: any) {
            setError(err?.message || 'Failed to update user')
        } finally {
            setSubmitting(false)
        }
    }

    const inputClass =
        'w-full px-3 py-2 bg-surface-2 border border-bd rounded-lg text-primary text-sm focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20'

    return (
        <div
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
            onClick={onClose}
        >
            <div
                className="bg-surface rounded-2xl border border-bd shadow-elevated w-[80%] sm:w-[50vw] h-[85vh] overflow-hidden flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div
                    className="px-6 py-4 flex items-center justify-between shrink-0"
                    style={{background: 'linear-gradient(135deg, var(--navy) 0%, var(--navy-mid) 100%)'}}
                >
                    <div>
                        <p className="text-[13px] font-bold text-white">Edit User</p>
                        <p className="text-[11px] text-white/50 mt-px">
                            {user.username} &middot; ID {user.id}
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
                    <form id="edit-user-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
                        <div>
                            <label className="block text-sm font-medium text-secondary mb-1">Full Name</label>
                            <input type="text" value={form.full_name} onChange={updateField('full_name')} readOnly
                                   className={`${inputClass} text-gray-500`}/>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-secondary mb-1">Email</label>
                            <input type="email" value={form.email} onChange={updateField('email')} readOnly
                                   className={`${inputClass} text-gray-500`}/>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-secondary mb-1">Username</label>
                            <input type="text" value={form.username} onChange={updateField('username')} readOnly
                                   className={`${inputClass} text-gray-500`}/>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-secondary mb-1">Roles</label>
                            <div className="flex flex-wrap gap-2">
                                {availableRoles.length === 0 && (
                                    <span className="text-xs text-muted">Loading roles…</span>
                                )}
                                {availableRoles.map((roleName) => {
                                    const checked = form.roles.includes(roleName)
                                    return (
                                        <label
                                            key={roleName}
                                            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border cursor-pointer text-sm capitalize ${checked
                                                ? 'border-accent bg-accent/10 text-primary'
                                                : 'border-bd bg-surface-2 text-secondary'
                                            }`}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={checked}
                                                onChange={() => toggleRole(roleName)}
                                                className="accent-current"
                                            />
                                            {roleName}
                                        </label>
                                    )
                                })}
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-secondary mb-1">Status</label>
                            <select value={form.is_active} onChange={updateField('is_active')} className={inputClass}>
                                <option value="true">Active</option>
                                <option value="false">Inactive</option>
                            </select>
                        </div>
                        {canChangePassword && (
                            <div>
                                <label className="block text-sm font-medium text-secondary mb-1">
                                    New Password <span
                                    className="text-muted font-normal">(leave blank to keep current)</span>
                                </label>
                                <input
                                    type="password"
                                    value={form.password}
                                    onChange={updateField('password')}
                                    placeholder="Min 8 characters"
                                    className={inputClass}
                                />
                            </div>
                        )}

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
                        Cancel
                    </button>
                    <button
                        type="submit"
                        form="edit-user-form"
                        disabled={submitting}
                        className="px-4 py-2 rounded-[9px] text-sm font-semibold text-white bg-accent hover:opacity-90 transition-opacity border-none cursor-pointer font-sans disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {submitting ? 'Saving…' : 'Save Changes'}
                    </button>
                </div>
            </div>
        </div>
    )
}

function NewUserModal({
                          onClose,
                          onSave,
                      }: {
    onClose: () => void
    onSave: (form: UserCreate) => Promise<void>
}) {
    const [form, setForm] = useState<UserCreate>({
        email: '',
        username: '',
        full_name: '',
        roles: [],
        is_active: false,
        password: '',
        date_of_birth: null,
        country: null,
        mobile_no: null,
        ext_no: null
    })

    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [availableRoles, setAvailableRoles] = useState<string[]>([])

    useEffect(() => {
        let cancelled = false
        ;(async () => {
            try {
                const {data} = await (client as any).get({
                    url: '/api/v1/access/roles',
                    headers: {'Content-Type': 'application/json'},
                })
                if (cancelled) return
                const roles = (data as any)?.data as Array<{ name: string }> | undefined
                if (Array.isArray(roles)) {
                    setAvailableRoles(roles.map(r => r.name))
                }
            } catch {
                // if (!cancelled) setAvailableRoles(getUserRoles(user))
            }
        })()
        return () => {
            cancelled = true
        }
    }, [])

    const updateField = (field: 'email' | 'username' | 'full_name' | 'is_active' | 'password' | 'country' | 'mobile_no' | 'ext_no' | 'date_of_birth') =>
        (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
            setForm((prev) => ({...prev, [field]: e.target.value}))
        }

    const toggleRole = (roleName: string) => {
        setForm((prev) => {
            const has = prev.roles!.includes(roleName)
            return {
                ...prev,
                roles: has ? prev.roles!.filter(r => r !== roleName) : [...prev.roles!, roleName],
            }
        })
    }

    const onDateChange = (value: string) => {
        setForm(prev => ({...prev, date_of_birth: value}))
    }

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault()
        setError(null)
        setSubmitting(true)
        try {
            await onSave(form)
            onClose()
        } catch (err: any) {
            setError(err?.message || 'Failed to create new user')
        } finally {
            setSubmitting(false)
        }
    }

    const onCountryChange = useCallback((selected: CountryProp | null) => {
        if (selected) {
            setForm(prev => ({...prev, country: selected.value}))
        }
    }, [])

    const inputClass =
        'w-full px-3 py-2 bg-surface-2 border border-bd rounded-lg text-primary text-sm focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20'

    return (
        <div
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
            onClick={onClose}
        >
            <div
                className="bg-surface rounded-2xl border border-bd shadow-elevated w-[80%] sm:w-[50vw] h-[85vh] overflow-hidden flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div
                    className="px-6 py-4 flex items-center justify-between shrink-0"
                    style={{background: 'linear-gradient(135deg, var(--navy) 0%, var(--navy-mid) 100%)'}}
                >
                    <div>
                        <p className="text-[13px] font-bold text-white">New User</p>
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
                    <form id="edit-user-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
                        <div className="flex flex-col gap-4">
                            <div className={'flex gap-4'}>
                                <div className={'flex-grow'}>
                                    <label className="block text-sm font-medium text-secondary mb-1">Username</label>
                                    <input type="text" value={form.username} onChange={updateField('username')} required
                                           className={`${inputClass} text-gray-500`}/>
                                </div>
                                <div className={'flex-grow'}>
                                    <label className="block text-sm font-medium text-secondary mb-1">
                                        Password
                                    </label>
                                    <input
                                        type="password"
                                        value={form.password}
                                        onChange={updateField('password')}
                                        placeholder="Min 8 characters"
                                        className={inputClass}
                                        required
                                    />
                                </div>
                            </div>
                            <div className={'flex-grow'}>
                                <label className="block text-sm font-medium text-secondary mb-1">Full Name</label>
                                <input type="text" value={form.full_name} onChange={updateField('full_name')}
                                       required
                                       className={`${inputClass} text-gray-500`}/>
                            </div>
                            <div className={'flex gap-4'}>

                                <div className={'flex-grow'}>
                                    <label className="block text-sm font-medium text-secondary mb-1">Email</label>
                                    <input className={inputClass} value={form.email} required
                                           onChange={updateField('email')}/>
                                </div>
                                <div className={'flex-grow'}>
                                    <label className="block text-sm font-medium text-secondary mb-1">Mobile No</label>
                                    <input className={inputClass} value={form.mobile_no ?? ''} required
                                           onChange={updateField('mobile_no')}/>
                                </div>
                                <div className={'flex-grow'}>
                                    <label className="block text-sm font-medium text-secondary mb-1">Ext No</label>
                                    <input className={inputClass} value={form.ext_no ?? ''}
                                           onChange={updateField('ext_no')}/>
                                </div>
                            </div>
                            <div className={'flex gap-4'}>
                            <div className={'flex-grow'}>
                                <label className="block text-sm font-medium text-secondary mb-1">Date of Birth</label>
                                <DateTimePicker value={form.date_of_birth ?? ''} onChange={onDateChange} dateOnly={true}
                                                required={true}/>
                            </div>
                            <div className={'flex-grow'}>
                                <label className="block text-sm font-medium text-secondary mb-1">Country</label>
                                <CountryLookup onChange={onCountryChange}/>
                            </div>
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-secondary mb-1">Status</label>
                            <select value={form.is_active!.toString()} onChange={updateField('is_active')}
                                    className={inputClass} required>
                                <option value="true">Active</option>
                                <option value="false">Inactive</option>
                            </select>
                        </div>
                        {/* Roles */}
                        <div>
                            <label className="block text-sm font-medium text-secondary mb-1">Roles</label>
                            <div className="flex flex-wrap gap-2">
                                {availableRoles.length === 0 && (
                                    <span className="text-xs text-muted">Loading roles…</span>
                                )}
                                {availableRoles.map((roleName) => {
                                    const checked = form.roles!.includes(roleName)
                                    return (
                                        <label
                                            key={roleName}
                                            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border cursor-pointer text-sm capitalize ${checked
                                                ? 'border-accent bg-accent/10 text-primary'
                                                : 'border-bd bg-surface-2 text-secondary'
                                            }`}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={checked}
                                                onChange={() => toggleRole(roleName)}
                                                className="accent-current"
                                            />
                                            {roleName}
                                        </label>
                                    )
                                })}
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
                        Cancel
                    </button>
                    <button
                        type="submit"
                        form="edit-user-form"
                        disabled={submitting}
                        className="px-4 py-2 rounded-[9px] text-sm font-semibold text-white bg-accent hover:opacity-90 transition-opacity border-none cursor-pointer font-sans disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {submitting ? 'Creating…' : 'Create New User'}
                    </button>
                </div>
            </div>
        </div>
    )
}

type SortKey = 'id' | 'username' | 'full_name' | 'email'

export default function UsersPage() {
    const {users, fetchUsers, updateUser, createUser} = useAdminStore(
        useShallow((s) => ({
            users: s.users,
            fetchUsers: s.fetchUsers,
            updateUser: s.updateUser,
            createUser: s.createUser
        })),
    )
    const [editingUser, setEditingUser] = useState<UserResponse | null>(null)
    const [isAddingUser, setAddingUser] = useState<boolean>(false)
    const [isAddingFromEsnaad, setAddingFromEsnaad] = useState(false)
    const permissions = useAuthStore(selectUserPermissions)
    const hasWrite = permissions.has('user:write')
    const {t} = useI18n();
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
    const [sortKey, setSortKey] = useState<SortKey>('username');
    const [searchText, setSearchText] = useState('')
    const [page, setPage] = useState<number>(0)

    const PAGE_SIZE = 10

    const filteredData = useMemo(() => {
        const result = users.filter(p => p.username.toLocaleLowerCase().includes(searchText.toLocaleLowerCase()) ||
            p.full_name.toLocaleLowerCase().includes(searchText.toLocaleLowerCase()) ||
            p.email.toLocaleLowerCase().includes(searchText.toLocaleLowerCase()) ||
            p.id.toLocaleString().includes(searchText.toLocaleLowerCase())
        )
        setPage(0)
        return result.sort((a, b) => {
            const cmp = typeof (a[sortKey]) === 'number' ? (a[sortKey] - (b[sortKey] as number)) : a[sortKey].toLocaleString().localeCompare(b[sortKey].toLocaleString())
            return sortDir == 'asc' ? cmp : -cmp
        })

    }, [searchText, sortKey, sortDir, users])

    const totalPages = Math.ceil(filteredData.length / PAGE_SIZE);

    const paginatedRows = useMemo(() => filteredData.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [filteredData, page])

    const toggleSort = useCallback((col: SortKey) => {
        setSortKey(col)
        setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    }, [])

    const SortIcon = ({col}: { col: SortKey }) => {
        if (sortKey !== col) return <HiMiniChevronUpDown className="text-[14px] text-muted opacity-50"/>;
        return sortDir === 'asc' ? <HiOutlineChevronUp className="text-[12px] text-accent"/> :
            <HiOutlineChevronDown className="text-[12px] text-accent"/>;
    };

    useEffect(() => {
        fetchUsers()
    }, [fetchUsers])

    const navigate = useNavigate()

    const editProfile = (user: UserResponse) => {
        navigate('/profile-general-info', {state: {user, toEdit: true}})
    }

    const handleSave = async (form: EditForm, user: UserResponse) => {
        const payload: Record<string, unknown> = {
            version: (user as any).version,
        }
        if (form.email !== user.email) payload.email = form.email
        if (form.username !== user.username) payload.username = form.username
        if (form.full_name !== user.full_name) payload.full_name = form.full_name

        const currentRoles = getUserRoles(user)
        const sameRoles =
            currentRoles.length === form.roles.length &&
            currentRoles.every(r => form.roles.includes(r))
        if (!sameRoles) payload.roles = form.roles

        const isActive = form.is_active === 'true'
        if (isActive !== user.is_active) payload.is_active = isActive
        if (form.password) payload.password = form.password

        await updateUser(user.id, payload as any)
    }

    return (
        <div className='flex flex-col gap-5 overflow-hidden h-[100%]'>
            {/* Page header */}
            <SectionHeader
                eyebrow={t('common.management')}
                title={t('userManagement.title')}
                actions={
                    hasWrite ? (
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <Btn onClick={() => setAddingFromEsnaad(true)} size={"sm"} variant="secondary">
                                <HiOutlineUserPlus className="text-[15px]"/>
                                Add from Esnaad
                            </Btn>
                            <Btn onClick={() => setAddingUser(true)} size={"sm"}>
                                <HiOutlinePlus className="text-[15px]"/>
                                Add User/Profile
                            </Btn>
                        </div>
                    ) : undefined
                }
            />

            {/* Table */}
            <div className='flex flex-col gap-2 overflow-auto h-full'>
                <SearchBar onSearch={setSearchText}/>
                <div className="card p-0 h-full overflow-auto">
                    <div className="overflow-auto">
                        <table className="w-full border-collapse ">
                            <thead>
                            <tr className="border-b border-bd" style={{background: 'var(--navy)'}}>
                                {
                                    [
                                        {key: 'id', label: 'ID'},
                                        {key: 'username', label: 'Username'},
                                        {key: 'full_name', label: 'Full Name'},
                                        {key: 'email', label: 'Email'},
                                    ].map(k => (
                                        <th key={`header-${k.key}`}
                                            className={`px-4 py-3 text-[11px] font-bold text-white/60 tracking-[0.06em] uppercase`}>
                                            <button onClick={() => toggleSort(k.key as SortKey)}
                                                    className={`flex items-center gap-1 hover:text-white transition-colors uppercase`}>{k.label}<SortIcon
                                                col={k.key as SortKey}/></button>
                                        </th>
                                    ))
                                }
                                {
                                    ['Roles', 'Status'].map((h) => (
                                        <th key={h}
                                            className="px-4 py-3 text-start text-[11px] font-bold text-white/60 uppercase tracking-[0.06em]">
                                            {h}
                                        </th>
                                    ))
                                }
                                <th key={'Action'}
                                    className="px-4 py-3 text-center text-[11px] font-bold text-white/60 uppercase tracking-[0.06em] width-[240px]">
                                    {'Action'}
                                </th>
                            </tr>
                            </thead>
                            <tbody className="divide-y divide-bd">
                            {paginatedRows.map((u) => {
                                const userRoles = getUserRoles(u)
                                return (
                                    <tr key={u.id} className="hover:bg-surface-2 transition-colors duration-100">
                                        <td className="px-4 py-3 text-sm text-muted">{u.id}</td>
                                        <td className="px-4 py-3 text-sm font-semibold text-primary">{u.username}</td>
                                        <td className="px-4 py-3 text-sm text-primary">{u.full_name}</td>
                                        <td className="px-4 py-3 text-sm text-secondary">{u.email}</td>
                                        <td className="px-4 py-3">
                                            <div className="flex flex-wrap gap-1">
                                                {userRoles.length === 0 && (
                                                    <span className="text-xs text-muted">—</span>
                                                )}
                                                {userRoles.map((r) => (
                                                    <RoleBadge key={r} role={r}/>
                                                ))}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                                <span
                                                    className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold"
                                                    style={u.is_active
                                                        ? {background: 'rgba(34,197,94,0.1)', color: '#16A34A'}
                                                        : {background: 'rgba(220,38,38,0.1)', color: '#DC2626'}
                                                    }
                                                >
                                                    {u.is_active ? t('common.active') : t('common.inactive')}
                                                </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className='flex gap-3 justify-center'>
                                                <button
                                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[7px] text-xs font-semibold bg-accent text-white hover:opacity-90 transition-opacity border-none cursor-pointer font-sans"
                                                    onClick={() => setEditingUser(u)}
                                                >
                                                    <HiOutlinePencilSquare className="text-[13px]"/>
                                                    Edit User
                                                </button>
                                                <button
                                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[7px] text-xs font-semibold bg-accent text-white hover:opacity-90 transition-opacity border-none cursor-pointer font-sans"
                                                    onClick={() => editProfile(u)}
                                                >
                                                    <HiOutlinePencilSquare className="text-[13px]"/>
                                                    Edit Profile
                                                </button>

                                            </div>
                                        </td>
                                    </tr>
                                )
                            })}
                            {filteredData.length === 0 && (
                                <tr>
                                    <td colSpan={7}>
                                        <EmptyState title={t('userManagement.noUsers')} bare/>
                                    </td>
                                </tr>
                            )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
            <Paginator2 page={page} totalPages={totalPages} onPageChanged={setPage} dataLength={filteredData.length}
                        pageSize={PAGE_SIZE}/>
            {editingUser && (
                <EditUserModal
                    user={editingUser}
                    onClose={() => setEditingUser(null)}
                    onSave={(form) => handleSave(form, editingUser)}
                />
            )}
            {isAddingUser && (
                <NewUserModal
                    onClose={() => setAddingUser(false)}
                    onSave={async (form) => {
                        await createUser(form)
                    }}
                />
            )}
            {isAddingFromEsnaad && (
                <AddEsnaadUser
                    onClose={() => setAddingFromEsnaad(false)}
                    onSubmit={async (form) => {
                        await createUser(form)
                    }}
                />
            )}
        </div>
    )
}
