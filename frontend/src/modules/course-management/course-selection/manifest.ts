import type {FeatureManifest} from '../../../infra/shared/types/permissions'
import CourseSelectionRoutes from './CourseSelectionRoutes'

const featureManifest: FeatureManifest = {
  i18n: 'nav.courseManagement.courseSelection.title',
  path: 'course-selection/*',
  page: CourseSelectionRoutes,
  permissions: ['course:*'],
  order: 15,
}

export default featureManifest
