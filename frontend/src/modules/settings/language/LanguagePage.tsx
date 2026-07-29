import { HiCheckCircle, HiOutlineLanguage } from 'react-icons/hi2'
import { useI18n } from '../../../infra/locales/I18nContext'
import type { LanguageCode } from '../../../infra/locales/I18nContext'
import SectionHeader from '../../../infra/shared/components/SectionHeader'

export default function LanguagePage() {
  const { lang, changeLanguage, t } = useI18n()

  const options: { code: LanguageCode; flag: string; native: string; engLabel: string }[] = [
    { code: 'en', flag: '🇺🇸', native: 'English',  engLabel: t('settings.english') },
    { code: 'ar', flag: '🇦🇪', native: 'العربية', engLabel: t('settings.arabic')  },
  ]

  return (
    <div className="flex flex-col gap-3">
      <SectionHeader
        icon={<HiOutlineLanguage />}
        title={t('settings.language')}
        description={t('settings.languageDesc')}
      />

      <div className="flex flex-col gap-3 max-w-[560px]">
        {options.map(opt => {
          const isActive = lang === opt.code
          return (
            <button
              key={opt.code}
              onClick={() => changeLanguage(opt.code)}
              className="flex items-center gap-4 px-5 py-4 rounded-[14px] text-start border-none transition-all duration-150 w-full font-sans"
              style={{
                border: `2px solid ${isActive ? 'var(--accent)' : 'var(--border)'}`,
                background: isActive ? 'var(--accent-light)' : 'var(--surface)',
                cursor: isActive ? 'default' : 'pointer',
                boxShadow: isActive ? '0 0 0 3px var(--accent-glow)' : '0 1px 3px rgba(0,0,0,0.05)',
              }}
            >
              <span className="text-[28px] shrink-0 leading-none">{opt.flag}</span>
              <div className="flex-1 min-w-0">
                <p className="text-[15px] font-bold text-primary">{opt.native}</p>
                <p className="text-[12px] text-muted">{opt.engLabel}</p>
              </div>
              {isActive && (
                <HiCheckCircle
                  className="text-[20px] shrink-0"
                  style={{ color: 'var(--accent)' }}
                />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
