import type {FeatureManifest} from '../../../infra/shared/types/permissions'
import CourseBuilderRoutes from './CourseBuilderRoutes'

const featureManifest: FeatureManifest = {
  i18n: 'nav.courseManagement.courseBuilder.title',
  path: 'course-builder/*',
  page: CourseBuilderRoutes,
  permissions: ['course_master:*'],
  order: 10,
}

export default featureManifest
