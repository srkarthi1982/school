import { HiOutlineCog6Tooth } from 'react-icons/hi2'
import type { ModuleManifest } from '../../infra/shared/types/permissions'

const manifest: ModuleManifest = {
  i18n: 'nav.settings',
  icon: HiOutlineCog6Tooth,
  path: '/settings',
  pinBottom: true,
  order: 90,
}
export default manifest
