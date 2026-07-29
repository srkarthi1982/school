import type { FeatureManifest } from '../../../infra/shared/types/permissions'
import ScheduleManagementRoutes from './ScheduleManagementRoutes'

const manifest: FeatureManifest = {
  i18n: 'nav.scheduleManagement',
  // Wildcard so the inner <Routes> can match the lesson detail sub-page;
  // toNavPath() strips the suffix so the nav link stays /…/schedule-management.
  path: 'schedule-management/*',
  page: ScheduleManagementRoutes,
  permissions: ['schedule_entry:read'],
  order: 10,
}
export default manifest
