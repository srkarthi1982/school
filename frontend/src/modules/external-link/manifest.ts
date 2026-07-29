import { HiOutlineGlobeAlt } from 'react-icons/hi2'
import type { ModuleManifest } from '../../infra/shared/types/permissions'
import AppsPage from './apps/AppsPage'

const manifest: ModuleManifest = {
  i18n: 'nav.externalLink.title',
  icon: HiOutlineGlobeAlt,
  path: '/external-link',
  permissions: ["teacher:*",'student:*'],
  order: 80,
  page:AppsPage
}
export default manifest
