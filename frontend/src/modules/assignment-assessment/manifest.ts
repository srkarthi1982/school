import {HiOutlineClipboardDocumentList} from 'react-icons/hi2'
import type {ModuleManifest} from '../../infra/shared/types/permissions'

const manifest: ModuleManifest = {
  i18n: 'nav.assignmentAssessment.title',
  icon: HiOutlineClipboardDocumentList,
  path: '/assignment-assessment',
  permissions: ["quiz:*"],
  order: 50,
}
export default manifest
