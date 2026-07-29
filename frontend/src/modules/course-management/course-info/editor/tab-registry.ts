import type { ComponentType } from 'react'
import type { TabProps } from './tabs/types'
import GeneralInformationTab from './tabs/GeneralInformationTab'
import LessonCreationTab from './tabs/LessonCreationTab'
import LessonPlanningTab from './tabs/LessonPlanningTab'
import PersonnelRequirementTab from './tabs/PersonnelRequirementTab'
import ResourcesTab from './tabs/ResourcesTab'
import TPLinkPreviewTab from './tabs/TPLinkPreviewTab'
import PlaceholderTab from './PlaceholderTab'

export const TAB_REGISTRY: Record<string, ComponentType<TabProps<any>>> = {
  general: GeneralInformationTab,
  personnel_requirement: PersonnelRequirementTab,
  resources: ResourcesTab,
  lesson_planning: LessonPlanningTab,
  lesson_creation: LessonCreationTab,
  tp_link_preview: TPLinkPreviewTab,
}

export function getTabComponent(tabNo: string): ComponentType<TabProps<any>> {
  return TAB_REGISTRY[tabNo] ?? PlaceholderTab
}
