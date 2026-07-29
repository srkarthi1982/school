import {IoBookOutline} from 'react-icons/io5'
import type {ModuleManifest} from '../../infra/shared/types/permissions'

const manifest: ModuleManifest = {
  i18n: 'nav.courseManagement.title',
  icon: IoBookOutline,
  path: '/course-management',
  permissions: ['course_master:*','course:*','library:*', 'student:*', 'teacher:*'],
  order: 40,
}
export default manifest
