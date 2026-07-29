import { HiCheckCircle, HiOutlinePaintBrush } from 'react-icons/hi2'
import { useTheme } from '../../../infra/theme/ThemeContext'
import { useI18n } from '../../../infra/locales/I18nContext'
import SectionHeader from '../../../infra/shared/components/SectionHeader'

export default function AppearancePage() {
  const { theme, toggleTheme } = useTheme()
  const { t } = useI18n()

  return (
    <div className="flex flex-col gap-3">
      <SectionHeader
        icon={<HiOutlinePaintBrush />}
        title={t('settings.appearance')}
        description={t('settings.appearanceDesc')}
      />

      <div className="flex gap-4 flex-wrap">
        <ThemeOption
          label={t('settings.light')}
          active={theme === 'light'}
          onClick={() => theme !== 'light' && toggleTheme()}
          preview="light"
        />
        <ThemeOption
          label={t('settings.dark')}
          active={theme === 'dark'}
          onClick={() => theme !== 'dark' && toggleTheme()}
          preview="dark"
        />
      </div>
    </div>
  )
}

interface ThemeOptionProps {
  label: string
  active: boolean
  onClick: () => void
  preview: 'light' | 'dark'
}

function ThemeOption({ label, active, onClick, preview }: ThemeOptionProps) {
  const isDark  = preview === 'dark'
  const bg      = isDark ? '#0B1221' : '#ECF0F6'
  const surface = isDark ? '#131D2E' : '#ffffff'
  const sidebar = '#11244E'
  const accent  = '#2DD4BF'
  const bar     = isDark ? '#1F2E42' : '#DDE3EE'
  const text    = isDark ? '#2a3a54' : '#E2E8F0'

  return (
    <button
      onClick={onClick}
      className="rounded-[16px] overflow-hidden text-start transition-all duration-200 border-none p-0"
      style={{
        width: 200,
        border: `2px solid ${active ? accent : 'var(--border)'}`,
        boxShadow: active ? `0 0 0 4px rgba(45,212,191,0.15)` : '0 1px 3px rgba(0,0,0,0.06)',
        cursor: active ? 'default' : 'pointer',
        background: 'var(--surface)',
      }}
    >
      <div className="flex gap-2 p-3" style={{ background: bg, height: 110 }}>
        <div
          className="rounded-[6px] w-[26px] shrink-0 flex flex-col items-center pt-2 gap-[6px]"
          style={{ background: sidebar }}
        >
          {[0, 1, 2].map(i => (
            <div
              key={i}
              className="w-3 rounded-[3px]"
              style={{ height: 10, background: i === 0 ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.2)' }}
            />
          ))}
        </div>
        <div className="flex-1 flex flex-col gap-[6px]">
          <div className="rounded-[5px] px-2 flex items-center gap-1.5" style={{ background: surface, height: 26 }}>
            <div className="h-[5px] w-4 rounded-full" style={{ background: accent }} />
            <div className="h-[5px] w-3 rounded-full" style={{ background: text }} />
          </div>
          <div className="flex-1 rounded-[5px] p-2 flex flex-col gap-[5px]" style={{ background: surface }}>
            <div className="h-[5px] w-4/5 rounded-full" style={{ background: text }} />
            <div className="h-[5px] w-3/5 rounded-full" style={{ background: bar }} />
            <div className="h-[5px] w-2/3 rounded-full" style={{ background: bar }} />
          </div>
        </div>
      </div>

      <div className="px-4 py-3 flex items-center justify-between" style={{ borderTop: '1px solid var(--border)' }}>
        <span className="text-[13px] font-semibold text-primary">{label}</span>
        {active && <HiCheckCircle className="text-[18px]" style={{ color: accent }} />}
      </div>
    </button>
  )
}
