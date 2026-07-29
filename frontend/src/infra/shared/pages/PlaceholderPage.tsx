import type { ReactNode } from 'react'
import {useI18n, ValidTranslationKeys} from '../../locales/I18nContext'

interface Feature {
  icon: ReactNode
  title: string
  description: string
}

interface PlaceholderPageProps {
  title: string
  role: 'admin' | 'teacher' | 'student' | 'all'
  description: string
  features: Feature[]
  icon?: ReactNode
}

const ROLE_COLORS: Record<PlaceholderPageProps['role'], { bg: string; text: string; labelKey: ValidTranslationKeys }> = {
  admin:   { bg: 'rgba(99,102,241,0.12)',  text: 'rgb(99,102,241)',  labelKey: 'placeholder.roleAdmin' },
  teacher: { bg: 'rgba(245,158,11,0.12)',  text: 'rgb(245,158,11)',  labelKey: 'placeholder.roleTeacher' },
  student: { bg: 'rgba(16,185,129,0.12)',  text: 'rgb(16,185,129)',  labelKey: 'placeholder.roleStudent' },
  all:     { bg: 'rgba(45,212,191,0.12)',  text: 'var(--accent)',    labelKey: 'placeholder.roleAll' },
}

export default function PlaceholderPage({ title, role, description, features, icon }: PlaceholderPageProps) {
  const { t } = useI18n()
  const roleStyle = ROLE_COLORS[role]

  return (
    <div className="max-w-[860px] pt-2 pb-10">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4">
          {/* Role badge */}
          <span
            className="text-[11px] font-bold uppercase tracking-[0.1em] px-2.5 py-1 rounded-full"
            style={{ background: roleStyle.bg, color: roleStyle.text }}
          >
            {String(t(roleStyle.labelKey))}
          </span>
          {/* Coming soon chip */}
          <span
            className="text-[11px] font-semibold px-2.5 py-1 rounded-full"
            style={{ background: 'rgba(45,212,191,0.1)', color: 'var(--accent)', border: '1px solid rgba(45,212,191,0.25)' }}
          >
            {t('placeholder.comingSoon')}
          </span>
        </div>

        <div className="flex items-center gap-3 mb-3">
          {icon && (
            <div
              className="w-10 h-10 rounded-[10px] flex items-center justify-center text-[22px] shrink-0"
              style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}
            >
              {icon}
            </div>
          )}
          <h1 className="text-[28px] font-bold tracking-[-0.02em]" style={{ color: 'var(--text-primary)' }}>
            {title}
          </h1>
        </div>

        <p className="text-[14px] leading-relaxed max-w-[620px]" style={{ color: 'var(--text-muted)' }}>
          {description}
        </p>

        <div className="h-px mt-6" style={{ background: 'var(--border)' }} />
      </div>

      {/* Feature cards */}
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.1em] mb-4" style={{ color: 'var(--text-muted)' }}>
          {t('placeholder.whatYouCanDo')}
        </p>
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
          {features.map((f, i) => (
            <div
              key={i}
              className="card px-5 py-4 flex flex-col gap-2"
            >
              <div
                className="w-8 h-8 rounded-[8px] flex items-center justify-center text-[17px] shrink-0"
                style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}
              >
                {f.icon}
              </div>
              <p className="text-[13.5px] font-semibold" style={{ color: 'var(--text-primary)' }}>{f.title}</p>
              <p className="text-[12px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>{f.description}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
