export interface TabProps<T = unknown> {
  value: T | null
  onChange: (next: T) => void
  onMarkComplete: () => void
  readOnly?: boolean
  /**
   * Id of the course being edited. Tabs that need to fetch course-scoped data
   * (e.g. Lesson Creation loading this course's resources) use it. Optional —
   * tabs driven purely by `value` can ignore it.
   */
  courseInfoId?: number
  /**
   * Bumped by the editor after a .docx import creates new combo-box options.
   * Tabs that load option dictionaries should re-run their loader when this
   * changes so freshly created options get labels (and any stale in-flight
   * load is cancelled). Optional — tabs without dictionaries can ignore it.
   */
  reloadToken?: number
}
