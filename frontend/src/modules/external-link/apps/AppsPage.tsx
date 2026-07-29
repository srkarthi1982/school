import {
  HiOutlineGlobeAlt,
  HiOutlineSquare2Stack,
  HiOutlineArrowTopRightOnSquare,
} from 'react-icons/hi2'
import { useI18n, ValidTranslationKeys } from '../../../infra/locales/I18nContext'
import useExternalLinkDefaultStore from '../store'
import SectionHeader from '../../../infra/shared/components/SectionHeader'
import EmptyState from '../../../infra/shared/components/EmptyState'

export default function AppsPage() {
  const { t } = useI18n()
  const externalApps = useExternalLinkDefaultStore(s => s.externalApps)
  return (
    <div className="flex flex-col gap-4 lg:min-h-0">
      <SectionHeader icon={<HiOutlineGlobeAlt />} title={t('nav.externalLink.title')} />
      {/* <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent-light text-accent text-3.5 font-semibold tracking-[0.06em] mb-3.5">
        <HiOutlineGlobeAlt className="text-[13px]" />
        <p className="uppercase">{t('nav.externalLink.title')}</p>
      </div> */}
      {externalApps.length === 0 ? (
        <EmptyState
          fill
          icon={<HiOutlineGlobeAlt />}
          title={t('common.noRecords')}
          description={t('empty.apps.description')}
          hints={[
            { icon: <HiOutlineSquare2Stack />, title: t('empty.apps.oneePlaceTitle'), description: t('empty.apps.onePlaceDesc') },
            { icon: <HiOutlineArrowTopRightOnSquare />, title: t('empty.apps.launchTitle'), description: t('empty.apps.launchDesc') },
          ]}
        />
      ) : (
      /* <div className='flex justify-center'> */
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,2fr))] gap-3 lg:flex-1 lg:min-h-0 lg:auto-rows-[minmax(150px,1fr)] overflow-auto thin-scrollbar-light content-start">
          {externalApps.map((app) => {
            const appName = t(`nav.externalLink.${app.name}` as ValidTranslationKeys)
            return (
              <div key={app.id} className="card px-5 py-4 flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <div
                    className="w-12 h-12 rounded-[12px] flex items-center justify-center shrink-0"
                    style={{ background: app.bg, color: app.color }}
                  >
                    <img src={`/icons/${app.icon}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-[14px] font-bold text-primary">{appName}</h3>
                    <p className="text-[11.5px] text-muted">{app.provider}</p>
                  </div>
                </div>
                <p className="text-[12px] text-secondary leading-relaxed">{app.description}</p>
                <button
                  onClick={() => window.open(app.url, '_blank', 'noopener')}
                  className="mt-auto inline-flex items-center justify-center gap-1.5 bg-accent text-white text-sm font-semibold py-[9px] px-4 rounded-[10px] hover:opacity-90 transition-opacity border-none cursor-pointer"
                >
                  {/* {app.label} */}
                  {`${t('nav.externalLink.open')} ${appName}`}
                  <HiOutlineGlobeAlt className="text-[13px]" />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
