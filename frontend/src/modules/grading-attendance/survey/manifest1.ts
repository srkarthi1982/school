import { HiOutlineChartBarSquare } from 'react-icons/hi2'
import { ModuleManifest } from '../../../infra/shared/types/permissions'
import SurveyDefaultPage from './SurveyDefaultPage'
 

const manifest: ModuleManifest = {
  i18n: 'nav.survey',
  icon: HiOutlineChartBarSquare,
  path: 'survey',
  page: SurveyDefaultPage,
  permissions: ["survey:*"],
  order: 60,
}
export default manifest
