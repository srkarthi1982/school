import type { ComponentType } from 'react'
import type { IconType } from 'react-icons'
import {
  HiOutlineChartBar,
  HiOutlineBolt,
  HiOutlineCircleStack,
  HiOutlineMagnifyingGlass,
} from 'react-icons/hi2'
import type { ValidTranslationKeys } from '../../../../infra/locales/I18nContext'
import RagOverviewPage from '../overview/RagOverviewPage'
import RagIngestionPage from '../ingestion/RagIngestionPage'
import RagChunksPage from '../chunks/RagChunksPage'
import RagPlaygroundPage from '../playground/RagPlaygroundPage'

export type CategorySlug = 'overview' | 'ingestion' | 'chunks' | 'playground'

export interface CategoryDef {
  slug: CategorySlug
  labelKey: ValidTranslationKeys
  descriptionKey: ValidTranslationKeys
  pageComponent: ComponentType
  icon: IconType
}

export const CATEGORIES: CategoryDef[] = [
  {
    slug: 'overview',
    labelKey: 'nav.ragOverview',
    descriptionKey: 'ragAdmin.overviewDesc',
    pageComponent: RagOverviewPage,
    icon: HiOutlineChartBar,
  },
  {
    slug: 'ingestion',
    labelKey: 'nav.ragIngestion',
    descriptionKey: 'ragAdmin.ingestionDesc',
    pageComponent: RagIngestionPage,
    icon: HiOutlineBolt,
  },
  {
    slug: 'chunks',
    labelKey: 'nav.ragChunks',
    descriptionKey: 'ragAdmin.chunksDesc',
    pageComponent: RagChunksPage,
    icon: HiOutlineCircleStack,
  },
  {
    slug: 'playground',
    labelKey: 'nav.ragPlayground',
    descriptionKey: 'ragAdmin.playgroundDesc',
    pageComponent: RagPlaygroundPage,
    icon: HiOutlineMagnifyingGlass,
  },
]
