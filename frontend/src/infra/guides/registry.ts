// Source-of-truth for interactive walkthroughs on the frontend.
//
// Ids here MUST match the backend catalog at
// backend/app/modules/agent/tools/ui_guides.py. The backend filter governs
// what the LLM can offer; the frontend re-validates with `canAccess` before
// rendering the "Show me how" button and before starting (defence in depth).
//
// Each step's `target` is a CSS selector matching a `[data-guide="…"]`
// anchor placed in the UI. Generic nav anchors live on the menu components
// (SidebarMenu / SubmenuAside / BottomNav / MobileSubmenuTabs / MoreSheet)
// with values like `nav:/assignment-assessment`; per-page anchors live on
// the actual buttons (e.g. `quiz-bank:create`). `route`, when present, makes
// the engine navigate there before waiting for the target.

import type { PermissionPattern } from '../shared/types/permissions'
import type { ValidTranslationKeys } from '../locales/I18nContext'

export type GuideAdvanceOn = 'click' | 'next'

export interface GuideStep {
  /** CSS selector for the element to spotlight, e.g. `[data-guide="nav:/assignment-assessment"]`. */
  target: string
  /** Navigate here first if not already there. */
  route?: string
  /** i18n key for the tooltip text (see `guides.<guide>.stepN`). */
  i18n: ValidTranslationKeys
  /** How the user advances past this step. Default 'click' (click the spotlighted element). */
  advanceOn?: GuideAdvanceOn
}

export interface GuideDefinition {
  /** Must match an id in the backend `_GUIDES` list. */
  id: string
  /** i18n key for the guide title (see `guides.<guide>.title`). */
  i18nTitle: string
  /** Permission patterns; user must match ANY pattern (same rules as `canAccess`). */
  permissions?: PermissionPattern[]
  steps: GuideStep[]
}

function nav(path: string): string {
  return `[data-guide="nav:${path}"]`
}

function pageMain(): string {
  return '[data-guide="page-main"]'
}

function btn(id: string): string {
  return `[data-guide="${id}"]`
}

export const GUIDES: Record<string, GuideDefinition> = {
  'create-quiz': {
    id: 'create-quiz',
    i18nTitle: 'guides.createQuiz.title',
    permissions: ['quiz:manage'],
    steps: [
      { target: nav('/assignment-assessment'), route: '/assignment-assessment', i18n: 'guides.createQuiz.step1' },
      { target: nav('/assignment-assessment/quiz-bank'), route: '/assignment-assessment/quiz-bank', i18n: 'guides.createQuiz.step2' },
      { target: btn('quiz-bank:create'), i18n: 'guides.createQuiz.step3' },
    ],
  },
  'create-personal-request': {
    id: 'create-personal-request',
    i18nTitle: 'guides.createPersonalRequest.title',
    permissions: ['request:create'],
    steps: [
      { target: nav('/communication-reporting'), route: '/communication-reporting', i18n: 'guides.createPersonalRequest.step1' },
      { target: nav('/communication-reporting/requests'), route: '/communication-reporting/requests', i18n: 'guides.createPersonalRequest.step2' },
      { target: btn('requests:new'), i18n: 'guides.createPersonalRequest.step3' },
    ],
  },
  'check-schedule': {
    id: 'check-schedule',
    i18nTitle: 'guides.checkSchedule.title',
    permissions: ['schedule_entry:read'],
    steps: [
      { target: nav('/dashboard-scheduling'), route: '/dashboard-scheduling', i18n: 'guides.checkSchedule.step1' },
      { target: nav('/dashboard-scheduling/schedule-management'), route: '/dashboard-scheduling/schedule-management', i18n: 'guides.checkSchedule.step2' },
      { target: pageMain(), i18n: 'guides.checkSchedule.step3', advanceOn: 'next' },
    ],
  },
  'take-quiz': {
    id: 'take-quiz',
    i18nTitle: 'guides.takeQuiz.title',
    permissions: ['quiz:take'],
    steps: [
      { target: nav('/assignment-assessment'), route: '/assignment-assessment', i18n: 'guides.takeQuiz.step1' },
      { target: nav('/assignment-assessment/quiz-bank'), route: '/assignment-assessment/quiz-bank', i18n: 'guides.takeQuiz.step2' },
      { target: pageMain(), i18n: 'guides.takeQuiz.step3', advanceOn: 'next' },
    ],
  },
  'view-grades': {
    id: 'view-grades',
    i18nTitle: 'guides.viewGrades.title',
    permissions: ['student:read'],
    steps: [
      { target: nav('/grading-attendance'), route: '/grading-attendance', i18n: 'guides.viewGrades.step1' },
      { target: pageMain(), i18n: 'guides.viewGrades.step2', advanceOn: 'next' },
    ],
  },
  'start-chat': {
    id: 'start-chat',
    i18nTitle: 'guides.startChat.title',
    steps: [
      { target: nav('/communication-reporting'), route: '/communication-reporting', i18n: 'guides.startChat.step1' },
      { target: nav('/communication-reporting/chat'), route: '/communication-reporting/chat', i18n: 'guides.startChat.step2' },
      { target: pageMain(), i18n: 'guides.startChat.step3', advanceOn: 'next' },
    ],
  },
  'share-file': {
    id: 'share-file',
    i18nTitle: 'guides.shareFile.title',
    permissions: ['file:read'],
    steps: [
      { target: nav('/communication-reporting'), route: '/communication-reporting', i18n: 'guides.shareFile.step1' },
      { target: nav('/communication-reporting/FileSharingPage'), route: '/communication-reporting/FileSharingPage', i18n: 'guides.shareFile.step2' },
      { target: btn('file-sharing:upload'), i18n: 'guides.shareFile.step3' },
    ],
  },
  'change-password': {
    id: 'change-password',
    i18nTitle: 'guides.changePassword.title',
    permissions: ['student:read', 'teacher:read'],
    steps: [
      { target: nav('/profile-general-info'), route: '/profile-general-info', i18n: 'guides.changePassword.step1' },
      { target: btn('profile:change-password'), i18n: 'guides.changePassword.step2' },
    ],
  },
  'edit-profile': {
    id: 'edit-profile',
    i18nTitle: 'guides.editProfile.title',
    permissions: ['student:read', 'teacher:read'],
    steps: [
      { target: nav('/profile-general-info'), route: '/profile-general-info', i18n: 'guides.editProfile.step1' },
      { target: btn('profile:edit'), i18n: 'guides.editProfile.step2' },
    ],
  },
  'view-dashboard': {
    id: 'view-dashboard',
    i18nTitle: 'guides.viewDashboard.title',
    permissions: ['dashboard:*'],
    steps: [
      { target: nav('/dashboard-scheduling'), route: '/dashboard-scheduling', i18n: 'guides.viewDashboard.step1' },
      { target: nav('/dashboard-scheduling/dashboard'), route: '/dashboard-scheduling/dashboard', i18n: 'guides.viewDashboard.step2' },
      { target: pageMain(), i18n: 'guides.viewDashboard.step3', advanceOn: 'next' },
    ],
  },
  'view-progress-tracker': {
    id: 'view-progress-tracker',
    i18nTitle: 'guides.viewProgressTracker.title',
    permissions: ['progress_tracker:*'],
    steps: [
      { target: nav('/dashboard-scheduling'), route: '/dashboard-scheduling', i18n: 'guides.viewProgressTracker.step1' },
      { target: nav('/dashboard-scheduling/progress-tracker'), route: '/dashboard-scheduling/progress-tracker', i18n: 'guides.viewProgressTracker.step2' },
      { target: pageMain(), i18n: 'guides.viewProgressTracker.step3', advanceOn: 'next' },
    ],
  },
  'create-course-builder': {
    id: 'create-course-builder',
    i18nTitle: 'guides.createCourseBuilder.title',
    permissions: ['course_master:write'],
    steps: [
      { target: nav('/course-management'), route: '/course-management', i18n: 'guides.createCourseBuilder.step1' },
      { target: nav('/course-management/course-builder'), route: '/course-management/course-builder', i18n: 'guides.createCourseBuilder.step2' },
      { target: btn('course-builder:create'), i18n: 'guides.createCourseBuilder.step3' },
    ],
  },
  'create-course-selection': {
    id: 'create-course-selection',
    i18nTitle: 'guides.createCourseSelection.title',
    permissions: ['course:write'],
    steps: [
      { target: nav('/course-management'), route: '/course-management', i18n: 'guides.createCourseSelection.step1' },
      { target: nav('/course-management/course-selection'), route: '/course-management/course-selection', i18n: 'guides.createCourseSelection.step2' },
      { target: btn('course-selection:create'), i18n: 'guides.createCourseSelection.step3' },
    ],
  },
  'view-enrolled-students': {
    id: 'view-enrolled-students',
    i18nTitle: 'guides.viewEnrolledStudents.title',
    permissions: ['student:read'],
    steps: [
      { target: nav('/course-management'), route: '/course-management', i18n: 'guides.viewEnrolledStudents.step1' },
      { target: nav('/course-management/enrolled-students'), route: '/course-management/enrolled-students', i18n: 'guides.viewEnrolledStudents.step2' },
      { target: pageMain(), i18n: 'guides.viewEnrolledStudents.step3', advanceOn: 'next' },
    ],
  },
  'view-library': {
    id: 'view-library',
    i18nTitle: 'guides.viewLibrary.title',
    steps: [
      { target: nav('/course-management'), route: '/course-management', i18n: 'guides.viewLibrary.step1' },
      { target: nav('/course-management/library'), route: '/course-management/library', i18n: 'guides.viewLibrary.step2' },
      { target: pageMain(), i18n: 'guides.viewLibrary.step3', advanceOn: 'next' },
    ],
  },
  'create-form': {
    id: 'create-form',
    i18nTitle: 'guides.createForm.title',
    permissions: ['form:creator'],
    steps: [
      { target: nav('/grading-attendance'), route: '/grading-attendance', i18n: 'guides.createForm.step1' },
      { target: nav('/grading-attendance/formnew'), route: '/grading-attendance/formnew', i18n: 'guides.createForm.step2' },
      { target: btn('form:create'), i18n: 'guides.createForm.step3' },
    ],
  },
  'view-form': {
    id: 'view-form',
    i18nTitle: 'guides.viewForm.title',
    permissions: ['form:view'],
    steps: [
      { target: nav('/grading-attendance'), route: '/grading-attendance', i18n: 'guides.viewForm.step1' },
      { target: nav('/grading-attendance/formnew'), route: '/grading-attendance/formnew', i18n: 'guides.viewForm.step2' },
      { target: pageMain(), i18n: 'guides.viewForm.step3', advanceOn: 'next' },
    ],
  },
  'take-form': {
    id: 'take-form',
    i18nTitle: 'guides.takeForm.title',
    permissions: ['form:take'],
    steps: [
      { target: nav('/grading-attendance'), route: '/grading-attendance', i18n: 'guides.takeForm.step1' },
      { target: nav('/grading-attendance/formnew'), route: '/grading-attendance/formnew', i18n: 'guides.takeForm.step2' },
      { target: pageMain(), i18n: 'guides.takeForm.step3', advanceOn: 'next' },
    ],
  },
  'create-survey': {
    id: 'create-survey',
    i18nTitle: 'guides.createSurvey.title',
    permissions: ['survey:creator'],
    steps: [
      { target: nav('/grading-attendance'), route: '/grading-attendance', i18n: 'guides.createSurvey.step1' },
      { target: nav('/grading-attendance/surveynew'), route: '/grading-attendance/surveynew', i18n: 'guides.createSurvey.step2' },
      { target: btn('survey:create'), i18n: 'guides.createSurvey.step3' },
    ],
  },
  'view-survey': {
    id: 'view-survey',
    i18nTitle: 'guides.viewSurvey.title',
    permissions: ['survey:view'],
    steps: [
      { target: nav('/grading-attendance'), route: '/grading-attendance', i18n: 'guides.viewSurvey.step1' },
      { target: nav('/grading-attendance/surveynew'), route: '/grading-attendance/surveynew', i18n: 'guides.viewSurvey.step2' },
      { target: pageMain(), i18n: 'guides.viewSurvey.step3', advanceOn: 'next' },
    ],
  },
  'take-survey': {
    id: 'take-survey',
    i18nTitle: 'guides.takeSurvey.title',
    permissions: ['survey:take'],
    steps: [
      { target: nav('/grading-attendance'), route: '/grading-attendance', i18n: 'guides.takeSurvey.step1' },
      { target: nav('/grading-attendance/surveynew'), route: '/grading-attendance/surveynew', i18n: 'guides.takeSurvey.step2' },
      { target: pageMain(), i18n: 'guides.takeSurvey.step3', advanceOn: 'next' },
    ],
  },
  'view-attendance': {
    id: 'view-attendance',
    i18nTitle: 'guides.viewAttendance.title',
    permissions: ['attendance:read'],
    steps: [
      { target: nav('/grading-attendance'), route: '/grading-attendance', i18n: 'guides.viewAttendance.step1' },
      { target: nav('/grading-attendance/class-attendance'), route: '/grading-attendance/class-attendance', i18n: 'guides.viewAttendance.step2' },
      { target: pageMain(), i18n: 'guides.viewAttendance.step3', advanceOn: 'next' },
    ],
  },
  'create-virtual-classroom': {
    id: 'create-virtual-classroom',
    i18nTitle: 'guides.createVirtualClassroom.title',
    permissions: ['class_session:write'],
    steps: [
      { target: nav('/communication-reporting'), route: '/communication-reporting', i18n: 'guides.createVirtualClassroom.step1' },
      { target: nav('/communication-reporting/virtual-classroom'), route: '/communication-reporting/virtual-classroom', i18n: 'guides.createVirtualClassroom.step2' },
      { target: btn('virtual-classroom:create'), i18n: 'guides.createVirtualClassroom.step3' },
    ],
  },
  'join-virtual-classroom': {
    id: 'join-virtual-classroom',
    i18nTitle: 'guides.joinVirtualClassroom.title',
    permissions: ['class_session:join'],
    steps: [
      { target: nav('/communication-reporting'), route: '/communication-reporting', i18n: 'guides.joinVirtualClassroom.step1' },
      { target: nav('/communication-reporting/virtual-classroom'), route: '/communication-reporting/virtual-classroom', i18n: 'guides.joinVirtualClassroom.step2' },
      { target: pageMain(), i18n: 'guides.joinVirtualClassroom.step3', advanceOn: 'next' },
    ],
  },
  'view-external-link': {
    id: 'view-external-link',
    i18nTitle: 'guides.viewExternalLink.title',
    permissions: ['student:read', 'teacher:read'],
    steps: [
      { target: nav('/external-link'), route: '/external-link', i18n: 'guides.viewExternalLink.step1' },
      { target: pageMain(), i18n: 'guides.viewExternalLink.step2', advanceOn: 'next' },
    ],
  },
}