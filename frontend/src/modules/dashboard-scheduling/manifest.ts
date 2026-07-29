import { HiOutlineCalendarDays } from 'react-icons/hi2'
import type { ModuleManifest } from '../../infra/shared/types/permissions'
import DashboardSchedulingDefaultPage from './DashboardSchedulingDefaultPage'

const manifest: ModuleManifest = {
  i18n: 'nav.dashboardScheduling',
  icon: HiOutlineCalendarDays,
  path: '/dashboard-scheduling',
  permissions: [],
  order: 30,
}
export default manifest
