import {useEffect, useMemo, useState} from 'react'
import {useShallow} from 'zustand/react/shallow'
import {
  HiOutlineArrowLeft,
  HiOutlineArrowPath,
  HiOutlineCheck,
  HiOutlineClipboardDocumentCheck,
  HiOutlineExclamationCircle,
  HiOutlineIdentification,
  HiOutlineMagnifyingGlass,
  HiOutlineShieldCheck,
  HiOutlineUserCircle,
  HiOutlineUserGroup,
  HiOutlineXMark,
} from 'react-icons/hi2'
import useAccessManagementStore from '../store'
import useAdminStore from '../../users-management/pages/store'
import {useI18n} from '../../../../infra/locales/I18nContext'
import EmptyState from '../../../../infra/shared/components/EmptyState'
import type {UserResponse} from '../../../../api/generated'

const ROLE_COLORS: Record<string, { bg: string; text: string }> = {
  admin: { bg: 'rgba(124,58,237,0.1)', text: '#7C3AED' },
  teacher: { bg: 'rgba(59,130,246,0.1)', text: '#2563EB' },
  student: { bg: 'rgba(34,197,94,0.1)', text: '#16A34A' },
  staff: { bg: 'rgba(249,115,22,0.1)', text: '#EA580C' },
}

function RoleChip({
  role,
  active,
  onToggle,
}: {
  role: string
  active: boolean
  onToggle: () => void
}) {
  const c = ROLE_COLORS[role] ?? { bg: 'rgba(100,116,139,0.1)', text: '#64748B' }
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold capitalize border transition-all cursor-pointer ${
        active
          ? 'border-transparent'
          : 'border-bd bg-surface-2 text-muted hover:bg-surface'
      }`}
      style={
        active
          ? { background: c.bg, color: c.text, borderColor: c.text + '40' }
          : undefined
      }
    >
      {active ? <HiOutlineCheck className="text-[11px]" /> : <HiOutlineXMark className="text-[11px] opacity-40" />}
      {role}
    </button>
  )
}

export default function AccessControlPage() {
  const { roles, fetchRoles, updateUserRoles, loading: accessLoading, error, clearError } =
    useAccessManagementStore(
      useShallow((s) => ({
        roles: s.roles,
        fetchRoles: s.fetchRoles,
        updateUserRoles: s.updateUserRoles,
        loading: s.loading,
        error: s.error,
        clearError: s.clearError,
      })),
    )

  const { users, fetchUsers } = useAdminStore(
    useShallow((s) => ({
      users: s.users,
      fetchUsers: s.fetchUsers,
    })),
  )

  const [selectedUser, setSelectedUser] = useState<UserResponse | null>(null)
  const [selectedRoles, setSelectedRoles] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const { t } = useI18n()

  useEffect(() => {
    fetchRoles()
    fetchUsers()
  }, [fetchRoles, fetchUsers])

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return users
    return users.filter(
      (u) =>
        u.username.toLowerCase().includes(q) ||
        u.full_name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q),
    )
  }, [users, search])

  const handleSelectUser = (user: UserResponse) => {
    setSelectedUser(user)
    setSelectedRoles(new Set(user.roles))
    setSaveError(null)
    setSaveSuccess(false)
    clearError()
  }

  const handleToggleRole = (role: string) => {
    setSelectedRoles((prev) => {
      const next = new Set(prev)
      if (next.has(role)) next.delete(role)
      else next.add(role)
      return next
    })
    setSaveSuccess(false)
  }

  const handleSave = async () => {
    if (!selectedUser) return
    setSaving(true)
    setSaveError(null)
    setSaveSuccess(false)
    try {
      await updateUserRoles(selectedUser.id, Array.from(selectedRoles), (selectedUser as any).version)
      setSaveSuccess(true)
      // Refresh users to get updated version/roles
      await fetchUsers()
      const refreshed = useAdminStore.getState().users.find((u) => u.id === selectedUser.id)
      if (refreshed) {
        setSelectedUser(refreshed)
        setSelectedRoles(new Set(refreshed.roles))
      }
    } catch (err: any) {
      setSaveError(err?.message || 'Failed to update user roles')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={'h-[100%] overflow-auto'}>
      <div className="flex flex-col lg:flex-row gap-6 min-h-[60vh] h-full">
      {/* Left pane: User list */}
      <div className="lg:w-[380px] flex flex-col gap-3 shrink-0">     
        <div className="relative">
          <HiOutlineMagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-[16px]" />
          <input
            type="text"
            placeholder={t('common.search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-surface-2 border border-bd rounded-lg text-primary text-sm focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
        </div>

        <div className="card p-0 overflow-hidden flex flex-col" >
          <div className="overflow-y-auto flex-1 thin-scrollbar" >
            {filteredUsers.map((u) => {
              const isActive = selectedUser?.id === u.id
              return (
                <button
                  key={u.id}
                  onClick={() => handleSelectUser(u)}
                  className={`w-full text-left px-4 py-3 border-b border-bd transition-colors cursor-pointer ${
                    isActive ? 'bg-accent/5 border-accent/20' : 'hover:bg-surface-2'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-primary">{u.full_name}</p>
                    <span
                      className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold"
                      style={
                        u.is_active
                          ? { background: 'rgba(34,197,94,0.1)', color: '#16A34A' }
                          : { background: 'rgba(220,38,38,0.1)', color: '#DC2626' }
                      }
                    >
                      {u.is_active ? t('common.active') : t('common.inactive')}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted mt-0.5">{u.username} · {u.email}</p>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {u.roles.map((r) => {
                      const c = ROLE_COLORS[r] ?? { bg: 'rgba(100,116,139,0.1)', text: '#64748B' }
                      return (
                        <span
                          key={r}
                          className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold capitalize"
                          style={{ background: c.bg, color: c.text }}
                        >
                          {r}
                        </span>
                      )
                    })}
                  </div>
                </button>
              )
            })}
            {filteredUsers.length === 0 && (
              <EmptyState
                title={t('common.noRecords')}
                description={t('empty.accessControl.noUsersDesc')}
                icon={<HiOutlineUserCircle />}
                bare
              />
            )}
          </div>
        </div>
      </div>

      {/* Right pane: Role assignment */}
      <div className="flex-1 card p-6 flex flex-col min-h-0 h-full">
        {!selectedUser ? (
          <EmptyState
            fill
            bare
            icon={<HiOutlineIdentification />}
            title={t('empty.accessControl.selectTitle')}
            description={t('empty.accessControl.selectDesc')}
            hints={[
              { icon: <HiOutlineUserGroup />, title: t('empty.accessControl.assignTitle'), description: t('empty.accessControl.assignDesc') },
              { icon: <HiOutlineClipboardDocumentCheck />, title: t('empty.accessControl.reviewTitle'), description: t('empty.accessControl.reviewDesc') },
              { icon: <HiOutlineShieldCheck />, title: t('empty.accessControl.secureTitle'), description: t('empty.accessControl.secureDesc') },
            ]}
          />
        ) : (
          <>
            <div className="flex items-start justify-between mb-6">
              <div>
                <p className="text-lg font-bold text-primary">{selectedUser.full_name}</p>
                <p className="text-sm text-secondary mt-0.5">
                  {selectedUser.username} · {selectedUser.email}
                </p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {selectedUser.roles.map((r) => {
                    const c = ROLE_COLORS[r] ?? { bg: 'rgba(100,116,139,0.1)', text: '#64748B' }
                    return (
                      <span
                        key={r}
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize"
                        style={{ background: c.bg, color: c.text }}
                      >
                        {r}
                      </span>
                    )
                  })}
                </div>
              </div>
              <button
                onClick={handleSave}
                disabled={saving || accessLoading}
                className="px-4 py-2 rounded-[9px] text-sm font-semibold text-white bg-accent hover:opacity-90 transition-opacity border-none cursor-pointer font-sans disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Saving…' : t('common.save')}
              </button>
            </div>

            {saveSuccess && (
              <div className="mb-4 flex items-center gap-2 px-3 py-2 rounded-lg bg-green-500/10 border border-green-500/20">
                <HiOutlineCheck className="text-green-500 text-[15px]" />
                <p className="text-sm text-green-600">Roles updated successfully.</p>
              </div>
            )}

            {(saveError || error) && (
              <div className="mb-4 flex items-start gap-2 px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20">
                <HiOutlineExclamationCircle className="text-red-500 text-[15px] mt-px shrink-0" />
                <div className="flex-1">
                  <p className="text-sm text-red-500">{saveError || error}</p>
                  {(saveError || error)?.includes('modified by another') && (
                    <button
                      onClick={async () => {
                        await fetchUsers()
                        const refreshed = useAdminStore.getState().users.find((u) => u.id === selectedUser.id)
                        if (refreshed) handleSelectUser(refreshed)
                      }}
                      className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-red-600 hover:underline cursor-pointer"
                    >
                      <HiOutlineArrowPath className="text-[11px]" />
                      Reload and retry
                    </button>
                  )}
                </div>
                <button onClick={() => { setSaveError(null); clearError() }} className="text-red-500 text-xs font-bold uppercase tracking-wider">
                  Dismiss
                </button>
              </div>
            )}

            <div className="flex-1">
              <p className="text-sm font-medium text-secondary mb-3">Assign Roles</p>
              <div className="flex flex-wrap gap-2">
                {roles.map((r) => (
                  <RoleChip
                    key={r.id}
                    role={r.name}
                    active={selectedRoles.has(r.name)}
                    onToggle={() => handleToggleRole(r.name)}
                  />
                ))}
              </div>
            </div>
          </>
        )}
      </div>
      </div>
    </div>
  )
}
