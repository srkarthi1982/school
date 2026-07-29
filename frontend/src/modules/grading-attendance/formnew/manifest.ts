import { HiOutlineChartBarSquare } from 'react-icons/hi2'
import { ModuleManifest } from '../../../infra/shared/types/permissions'
import FormDefaultPage from './FormDefaultPage'
 
 

const manifest: ModuleManifest = {
  i18n: 'nav.form',
  icon: HiOutlineChartBarSquare,
  path: 'formnew',
  page: FormDefaultPage,
  permissions: ["form:*"],
  order: 60,
}
export default manifest
