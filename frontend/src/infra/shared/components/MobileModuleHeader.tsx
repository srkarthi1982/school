import { useI18n } from '../../locales/I18nContext'
import type { MenuItem } from '../types/permissions'

type Props = { module: MenuItem; className?: string }

export default function MobileModuleHeader({ module, className }: Props) {
  const { t } = useI18n()
  const Icon = module.icon

  return (
    <div
      className={`flex items-center gap-2 px-4 py-2.5 border-b border-[var(--border)] bg-bg shrink-0 ${className ?? ''}`}
    >
      {Icon && <Icon className="text-[18px] text-accent shrink-0" />}
      {module.i18n && (
        <h1 className="text-[14px] font-bold text-primary tracking-[-0.01em] truncate">
          {t(module.i18n)}
        </h1>
      )}
    </div>
  )
}
