import {
  computeTabsProgress,
  isCertificateComplete,
  isCurrenciesComplete,
  isFlightComplete,
  isTaskAssociationComplete,
  isFlightPackAssociationComplete
} from '../currencies-certificate/currency-cert-config'

// Local mirror of backend response/request schemas for Course Builder + Courses.
// Re-exported here so the shared list / detail / modal components don't depend
// on the generated SDK (which won't include the new endpoints until
// `npm run generate-api` runs against a backend that has the new routes).

export interface CourseMasterRecord {
  id: number
  title: string
  course_date: string | null
  status: string
  course_info_completion: number
  material_completion: number
  surveys_completion: number
  evaluation_completion: number
  schedule_completion: number
  // Number of Course instances (Course Selection) spawned from this master.
  course_count: number
  // Bitmask of the Currencies (60) / Certificate (40) sub-tabs; the Flight
  // Package and Task Association sub-tabs live in their own columns, so the
  // category percentage must be composed from all three (see completionOf).
  currencies_certificate_completion: number
  flight_package_completion: number
  flight_pack_association_completion: number
  task_association_completion: number
  version: number
  ctp_version: string | null
  created_by_id: number | null
  updated_by_id: number | null
  created_at: string
  updated_at: string
}

export interface CourseRecord
  extends Omit<CourseMasterRecord, 'ctp_version' | 'course_count'> {
  master_id: number
  start_date: string | null
  end_date: string | null
  class_time: string | null
  location: string | null
  personnel_completion: number
  // course_info_completion is inherited from CourseMasterRecord — instances now
  // carry their own Course Information category.
  // True when the instance's content for that category differs from the master.
  material_modified: boolean
  surveys_modified: boolean
   evaluation_modified: boolean
   course_info_modified: boolean
   currencies_cert_modified: boolean
   // When the currencies & certificate data has been lazily seeded.
   currencies_cert_seeded: boolean
   // Days already added via post-approval period extensions (cumulative cap:
   // 20% of the original period).
   extended_days: number
   // Stop/resume: date the course was stopped (null unless status "stopped")
   // and total days spent on hold across all past stops.
   stopped_at: string | null
   stopped_days: number
}

export type CourseEntity = CourseMasterRecord | CourseRecord

export type CategorySlug =
  | 'course-information'
  | 'personnel'
  | 'material'
  | 'surveys'
  | 'evaluation'
  | 'schedule'
  | 'currencies-certificate'

export type CompletionKey =
  | 'course_info_completion'
  | 'personnel_completion'
  | 'material_completion'
  | 'surveys_completion'
  | 'evaluation_completion'
  | 'schedule_completion'
  | 'currencies_certificate_completion'

export interface CategoryDef {
  slug: CategorySlug
  label: string	
  completionKey: CompletionKey
}

// Read a completion percentage off either entity shape (masters don't have
// personnel_completion; instances don't have course_info_completion).
export function completionOf(record: CourseEntity, key: CompletionKey): number {
  if (key === 'currencies_certificate_completion') {
    // The stored value only encodes the Currencies/Certificate sub-tabs;
    // compose the 4-tab percentage the category detail page shows.
    const r = record as Partial<CourseMasterRecord>
    const mask = r.currencies_certificate_completion ?? 0
    return computeTabsProgress(
      isFlightComplete(r.flight_package_completion ?? 0),
      isCurrenciesComplete(mask),
      isTaskAssociationComplete(r.task_association_completion ?? 0),
      isCertificateComplete(mask),
      isFlightPackAssociationComplete(record.flight_pack_association_completion ?? 0)
    ).overallProgress
  }
  return (record as Partial<Record<CompletionKey, number>>)[key] ?? 0
}

// Order is load-bearing: spec §6 says each category must be filled
// sequentially. The detail page disables a row until the previous row's
// completion reaches 100.
export const CATEGORIES: CategoryDef[] = [
  { slug: 'course-information', label: 'Course Information', completionKey: 'course_info_completion' },
  { slug: 'material',   label: 'Material',   completionKey: 'material_completion' },
  { slug: 'surveys',    label: 'Form Builder', completionKey: 'surveys_completion' },
  { slug: 'evaluation', label: 'Evaluation', completionKey: 'evaluation_completion' },
  { slug: 'schedule',   label: 'Schedule',   completionKey: 'schedule_completion' },
  { slug: 'currencies-certificate', label: 'Currencies & Certificate', completionKey: 'currencies_certificate_completion' },
]

// Categories for a Course INSTANCE (Course Selection). Personnel is the first,
// gating category; Course Information sits second (its own instance copy,
// cloned from the master) and gates Material behind it.
export const INSTANCE_CATEGORIES: CategoryDef[] = [
  { slug: 'personnel',          label: 'Personnel',          completionKey: 'personnel_completion' },
  { slug: 'course-information', label: 'Course Information', completionKey: 'course_info_completion' },
  { slug: 'material',           label: 'Material',           completionKey: 'material_completion' },
  { slug: 'surveys',            label: 'Form',               completionKey: 'surveys_completion' },
  { slug: 'evaluation',         label: 'Evaluation',         completionKey: 'evaluation_completion' },
  { slug: 'schedule',           label: 'Schedule',           completionKey: 'schedule_completion' },
  { slug: 'currencies-certificate', label: 'Currencies & Certificate', completionKey: 'currencies_certificate_completion' },
]
