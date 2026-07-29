import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  HiArrowRightOnRectangle,
  HiOutlineUserCircle,
  HiOutlinePaintBrush,
  HiOutlineLanguage,
  HiOutlineShieldCheck,
  HiOutlineIdentification,
  HiOutlineChevronRight,
} from 'react-icons/hi2'
import { useI18n } from '../../../infra/locales/I18nContext'
import useAuthStore, { selectUser, selectLogout } from '../../../infra/auth/useAuthStore'
import SectionHeader from '../../../infra/shared/components/SectionHeader'
import PersonalAccessTokens from './PersonalAccessTokens'

// Personal Access Tokens section is hidden unless explicitly enabled via env.
const patEnabled = import.meta.env.VITE_ENABLE_PAT === 'true'

export default function AccountPage() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const user   = useAuthStore(selectUser)
  const logout = useAuthStore(selectLogout)

  const quickLinks: { icon: ReactNode; label: string; description: string; to: string }[] = [
    { icon: <HiOutlineIdentification />, label: t('empty.account.profileLabel'), description: t('empty.account.profileDesc'), to: '/profile-general-info' },
    { icon: <HiOutlineShieldCheck />, label: t('empty.account.accessLabel'), description: t('empty.account.accessDesc'), to: '/settings/access-management' },
    { icon: <HiOutlinePaintBrush />, label: t('settings.appearance'), description: t('settings.appearanceDesc'), to: '/settings/appearance' },
    { icon: <HiOutlineLanguage />, label: t('settings.language'), description: t('settings.languageDesc'), to: '/settings/language' },
  ]

  const initials = user?.full_name
    ?.split(' ')
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase() ?? '?'

  return (
    <div className="flex flex-col lg:min-h-0">
      <SectionHeader
        className="mb-4"
        icon={<HiOutlineUserCircle />}
        title={t('settings.account')}
        description={t('settings.accountDesc')}
      />

      <div className="card px-6 py-5 flex items-center gap-5 mb-5">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center text-[20px] font-bold text-white shrink-0"
          style={{ background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-dark) 100%)' }}
        >
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[16px] font-bold text-primary truncate uppercase">{user?.full_name}</p>
          <p className="text-[13px] text-muted capitalize">
            {((user as unknown as { roles?: string[] })?.roles)?.join(', ') ?? '—'}
          </p>
        </div>
      </div>

      <p className="text-[11px] font-bold text-muted tracking-[0.1em] uppercase mb-3">
        {t('empty.account.shortcuts')}
      </p>
      <div
        className="grid gap-3 mb-5"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}
      >
        {quickLinks.map((link) => (
          <button
            key={link.to}
            type="button"
            onClick={() => navigate(link.to)}
            className="card group flex items-center gap-3 px-5 py-4 text-start cursor-pointer font-sans hover:border-[var(--accent)] transition-colors"
          >
            <span
              className="w-10 h-10 rounded-xl flex items-center justify-center text-[20px] shrink-0"
              style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}
            >
              {link.icon}
            </span>
            <span className="flex-1 min-w-0">
              <p className="text-[13.5px] font-bold text-primary">{link.label}</p>
              <p className="text-[12px] text-muted leading-relaxed mt-0.5">{link.description}</p>
            </span>
            <HiOutlineChevronRight className="text-muted text-[16px] group-hover:translate-x-0.5 group-hover:text-accent transition-all shrink-0" />
          </button>
        ))}
      </div>

      {patEnabled && <PersonalAccessTokens />}

      <div
        className="rounded-[14px] px-6 py-5 flex items-center justify-between lg:mt-auto"
        style={{ border: '1px solid var(--danger-light)', background: 'var(--danger-light)' }}
      >
        <div>
          <p className="text-[14px] font-semibold text-primary mb-0.5">
            {t('auth.logout')}
          </p>
          <p className="text-[13px] text-muted">
            {t('settings.logoutDesc')}
          </p>
        </div>
        <button
          onClick={logout}
          className="flex items-center gap-2 px-4 py-2.5 rounded-[10px] text-[13px] font-semibold transition-all duration-150 cursor-pointer border-none shrink-0 ms-6"
          style={{
            background: 'var(--danger-light)',
            color: 'var(--danger)',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--danger-glow)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'var(--danger-light)')}
        >
          <HiArrowRightOnRectangle className="text-[16px]" />
          {t('auth.logout')}
        </button>
      </div>
    </div>
  )
}
