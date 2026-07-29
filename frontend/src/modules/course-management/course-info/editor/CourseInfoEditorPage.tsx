import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { HiOutlineArrowLeft, HiOutlineDocumentText } from 'react-icons/hi2'
import { useCourseInfoApi, type CourseInfoApi } from './ApiContext'
import { useToast } from '../../../../infra/shared/store/useToastStore'
import { confirmDialog } from '../../../../infra/shared/store/useConfirmStore'
import useFullBleedStore from '../../../../infra/shared/store/useFullBleedStore'
import type { GeneralInformationData } from './tabs/GeneralInformationTab'
import type { LessonCreationData } from './tabs/LessonCreationTab'
import type { LessonPlanningData } from './tabs/LessonPlanningTab'
import type { PersonnelRequirementData } from './tabs/PersonnelRequirementTab'
import type { ResourcesData } from './tabs/ResourcesTab'
import { TABS } from './catalogue'
import { getTabComponent } from './tab-registry'
import useEditorStore from './editor-store'
import useAutoSave from './useAutoSave'
import EditorProgressBar from './EditorProgressBar'
import TabBar from './TabBar'
import EditorFooter from './EditorFooter'
import ImportDocxModal from './components/ImportDocxModal'
import Breadcrumb, { courseCategoryCrumbs } from '../../_shared/Breadcrumb'

interface CourseInfoEditorPageProps {
  courseInfoId: number
  returnPath: string
  // When provided, only these tab numbers are editable; every other tab is
  // locked read-only. Course Selection passes ['lesson_creation'] so an
  // instance can only edit its Lesson Creation tab — the rest are inherited
  // from the master and shown read-only.
  editableTabNos?: string[]
}

// Apply imported values over the current form data, skipping anything the
// document didn't fill (null/undefined or empty arrays) so existing fields and
// unmapped categories are preserved.
function mergeImported(
  current: Record<string, unknown>,
  imported: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...current }
  for (const [key, value] of Object.entries(imported)) {
    if (value === null || value === undefined) continue
    if (Array.isArray(value) && value.length === 0) continue
    out[key] = value
  }
  return out
}

// Per-tab dispatchers. Each implemented tab knows how to fetch its typed
// payload and persist back with the right shape — no opaque JSON blobs.
async function fetchTabData(
  api: CourseInfoApi,
  courseInfoId: number,
  tabNo: string,
): Promise<{ status: string; data: unknown | null } | null> {
  if (tabNo === 'general') {
    const resp = await api.getGeneralInformation(courseInfoId)
    if (resp.success && resp.data) {
      return { status: resp.data.status, data: resp.data.data }
    }
    return null
  }
  if (tabNo === 'personnel_requirement') {
    const resp = await api.getPersonnelRequirement(courseInfoId)
    if (resp.success && resp.data) {
      return { status: resp.data.status, data: resp.data.data }
    }
    return null
  }
  if (tabNo === 'resources') {
    const resp = await api.getResources(courseInfoId)
    if (resp.success && resp.data) {
      return { status: resp.data.status, data: resp.data.data }
    }
    return null
  }
  if (tabNo === 'lesson_planning') {
    const resp = await api.getLessonPlanning(courseInfoId)
    if (resp.success && resp.data) {
      return { status: resp.data.status, data: resp.data.data }
    }
    return null
  }
  if (tabNo === 'lesson_creation') {
    const resp = await api.getLessonCreation(courseInfoId)
    if (resp.success && resp.data) {
      return { status: resp.data.status, data: resp.data.data }
    }
    return null
  }
  return null
}

async function persistTabData(
  api: CourseInfoApi,
  courseInfoId: number,
  tabNo: string,
  status: string,
  data: unknown,
): Promise<{ status: string; data: unknown | null } | null> {
  if (tabNo === 'general') {
    const resp = await api.upsertGeneralInformation(courseInfoId, {
      status,
      data: (data ?? {}) as GeneralInformationData,
    })
    if (resp.success && resp.data) {
      return { status: resp.data.status, data: resp.data.data }
    }
    return null
  }
  if (tabNo === 'personnel_requirement') {
    const resp = await api.upsertPersonnelRequirement(courseInfoId, {
      status,
      data: (data ?? {}) as PersonnelRequirementData,
    })
    if (resp.success && resp.data) {
      return { status: resp.data.status, data: resp.data.data }
    }
    return null
  }
  if (tabNo === 'resources') {
    const resp = await api.upsertResources(courseInfoId, {
      status,
      data: (data ?? {}) as ResourcesData,
    })
    if (resp.success && resp.data) {
      return { status: resp.data.status, data: resp.data.data }
    }
    return null
  }
  if (tabNo === 'lesson_planning') {
    const resp = await api.upsertLessonPlanning(courseInfoId, {
      status,
      data: (data ?? {}) as LessonPlanningData,
    })
    if (resp.success && resp.data) {
      return { status: resp.data.status, data: resp.data.data }
    }
    return null
  }
  if (tabNo === 'lesson_creation') {
    const resp = await api.upsertLessonCreation(courseInfoId, {
      status,
      data: (data ?? {}) as LessonCreationData,
    })
    if (resp.success && resp.data) {
      return { status: resp.data.status, data: resp.data.data }
    }
    return null
  }
  return null
}

export default function CourseInfoEditorPage({
  courseInfoId,
  returnPath,
  editableTabNos,
}: CourseInfoEditorPageProps) {
  const navigate = useNavigate()
  const toast = useToast()
  const api = useCourseInfoApi()

  const {
    courseInfoId: storedId,
    courseTitle,
    version,
    activeTabNo,
    tabCache,
    dirty,
    pendingData,
    setCourseInfo,
    setActiveTab,
    cacheTabData,
    cacheTabStatus,
    markDirty,
    clearDirty,
    reset,
  } = useEditorStore()

  const [loading, setLoading] = useState(false)
  // Once the course master is approved, completed tabs are locked.
  const [masterApproved, setMasterApproved] = useState(false)
  const [headerEdit, setHeaderEdit] = useState(false)
  const [titleInput, setTitleInput] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isSavingDraft, setIsSavingDraft] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [optionsReloadToken, setOptionsReloadToken] = useState(0)
  const fetchedKeysRef = useRef<Set<string>>(new Set())

  // Reset store on unmount so the next edit starts fresh.
  useEffect(() => {
    return () => {
      reset()
    }
  }, [reset])

  // Fill the content area edge-to-edge (drops Layout's standard frame padding).
  const setFullBleed = useFullBleedStore((s) => s.setFullBleed)
  useEffect(() => {
    setFullBleed(true)
    return () => setFullBleed(false)
  }, [setFullBleed])

  const loadCourseInfo = useCallback(async () => {
    setLoading(true)
    try {
      const resp = await api.getCourseInfo(courseInfoId)
      if (resp.success && resp.data) {
        const d = resp.data
        setCourseInfo(d.id, d.course_title, d.version)
        setMasterApproved(d.course_master_status === 'approved')
        setTitleInput(d.course_title)
        for (const t of d.tabs || []) {
          cacheTabStatus(t.tab_no, t.status)
        }
      }
    } finally {
      setLoading(false)
    }
  }, [api, courseInfoId, setCourseInfo, cacheTabStatus])

  useEffect(() => {
    if (courseInfoId && courseInfoId !== storedId) {
      fetchedKeysRef.current.clear()
      loadCourseInfo()
    }
  }, [courseInfoId, storedId, loadCourseInfo])

  const currentTabDef = TABS.find((t) => t.no === activeTabNo)

  // Lazy-load full tab data when the active tab changes.
  useEffect(() => {
    if (!courseInfoId || !currentTabDef || !currentTabDef.implemented) return
    if (fetchedKeysRef.current.has(activeTabNo)) return
    fetchedKeysRef.current.add(activeTabNo)
    ;(async () => {
      try {
        const entry = await fetchTabData(api, courseInfoId, activeTabNo)
        if (entry) {
          cacheTabData(activeTabNo, entry)
        }
      } catch {
        // 404 means no data yet — that's fine.
      }
    })()
  }, [api, courseInfoId, activeTabNo, currentTabDef, cacheTabData])

  const handleSaveDraft = async () => {
    if (!currentTabDef || !currentTabDef.implemented) return
    // Locked tabs (everything but Lesson Creation in Course Selection) are
    // read-only — never persist over the master-inherited content.
    if (editableTabNos != null && !editableTabNos.includes(activeTabNo)) return
    // Completed tabs are read-only; persisting would downgrade them to draft
    // (and the backend rejects that once the course master is approved).
    if (tabCache[activeTabNo]?.status === 'complete') return
    setIsSavingDraft(true)
    try {
      const data = pendingData ?? tabCache[activeTabNo]?.data ?? {}
      const result = await persistTabData(api, courseInfoId, activeTabNo, 'draft', data)
      if (result) {
        cacheTabData(activeTabNo, result)
      }

      if (activeTabNo === 'general') {
        // Saving the General tab writes the course title, which bumps the
        // master's version. Re-read so the cached title/version stay current.
        const resp = await api.getCourseInfo(courseInfoId)
        if (resp.success && resp.data) {
          setCourseInfo(resp.data.id, resp.data.course_title, resp.data.version)
        }
      }

      clearDirty()
      toast.success({ title: 'Draft saved' })
    } finally {
      setIsSavingDraft(false)
    }
  }

  const { lastAutoSavedAt } = useAutoSave(handleSaveDraft)

  const handleImportFile = async (files: Record<string, File>) => {
    const resp =
      activeTabNo === 'resources'
        ? await api.importResources(courseInfoId, files.file)
        : activeTabNo === 'lesson_planning'
        ? await api.importLessonPlanning(courseInfoId, files.file)
        : activeTabNo === 'lesson_creation'
        ? await api.importLessonCreation(courseInfoId, files.syllabus, files.scalar)
        : await api.importGeneralInformation(courseInfoId, files.file)
    if (!resp.success || !resp.data) {
      throw new Error(resp.error?.message || 'Import failed')
    }
    // Merge over the current form data so fields the document didn't fill
    // (e.g. CTP Version, or unmapped resource categories) are preserved, then
    // mark dirty for review + Save.
    const current = (pendingData ?? tabCache[activeTabNo]?.data ?? {}) as Record<string, unknown>
    markDirty(mergeImported(current, resp.data as Record<string, unknown>))
    // Force tabs to reload their option dictionaries so newly created options
    // (entry standards, resource items) resolve to labels instead of "—".
    setOptionsReloadToken((n) => n + 1)
    toast.success({ title: 'Imported from document', body: 'Review the fields and Save.' })
  }

  const handleMarkComplete = async () => {
    if (!currentTabDef || !currentTabDef.implemented) return
    if (editableTabNos != null && !editableTabNos.includes(activeTabNo)) return
    const data = pendingData ?? tabCache[activeTabNo]?.data ?? {}
    const result = await persistTabData(api, courseInfoId, activeTabNo, 'complete', data)
    if (result) {
      cacheTabData(activeTabNo, result)
    }
    if (activeTabNo === 'general') {
      const resp = await api.getCourseInfo(courseInfoId)
      if (resp.success && resp.data) {
        setCourseInfo(resp.data.id, resp.data.course_title, resp.data.version)
      }
    }
    clearDirty()
    toast.success({ title: 'Marked as complete' })
  }

  const handleUnmarkComplete = async () => {
    if (!currentTabDef || !currentTabDef.implemented) return
    const data = tabCache[activeTabNo]?.data ?? {}
    const result = await persistTabData(api, courseInfoId, activeTabNo, 'draft', data)
    if (result) {
      cacheTabData(activeTabNo, result)
    }
    clearDirty()
  }

  const handleNavigate = (tabNo: string) => {
    setActiveTab(tabNo)
    clearDirty()
  }

  const handleSaveAndClose = async () => {
    if (!currentTabDef || !currentTabDef.implemented) {
      navigate(returnPath)
      return
    }
    setIsSaving(true)
    try {
      await handleSaveDraft()
    } finally {
      setIsSaving(false)
    }
    navigate(returnPath)
  }

  const handleClose = async () => {
    if (
      dirty &&
      !(await confirmDialog({
        title: 'Discard unsaved changes?',
        message: 'You have unsaved changes. Continue without saving?',
        confirmLabel: 'Discard',
        tone: 'danger',
      }))
    )
      return
    navigate(returnPath)
  }

  // Warn when closing the browser tab with unsaved changes.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  const handleTitleBlur = async () => {
    if (titleInput === courseTitle) {
      setHeaderEdit(false)
      return
    }
    // Marking tabs complete bumps the master's version (completion sync), so the
    // cached version may be stale. Re-read it before the optimistic-locked update.
    const fresh = await api.getCourseInfo(courseInfoId)
    const currentVersion = fresh.success && fresh.data ? fresh.data.version : version
    const resp = await api.updateCourseInfo(courseInfoId, {
      version: currentVersion,
      course_title: titleInput,
    })
    if (resp.success && resp.data) {
      setCourseInfo(courseInfoId, resp.data.course_title, resp.data.version)
    }
    setHeaderEdit(false)
  }

  // Course Information is shared by Course Builder and Course Selection — derive
  // the breadcrumb's scope label and list path from the caller's return path.
  const isBuilder = returnPath.includes('/course-builder')
  const scopeLabel = isBuilder ? 'Course Builder' : 'Course Selection'
  const listPath = returnPath.replace(/\/\d+$/, '')

  const ActiveTabComponent = getTabComponent(activeTabNo)
  const isTabComplete = tabCache[activeTabNo]?.status === 'complete'
  // Tabs outside the editable allow-list (Course Selection → Lesson Creation
  // only) are locked: inherited from the master and not editable here.
  const tabLocked = editableTabNos != null && !editableTabNos.includes(activeTabNo)
  const isReadOnly = isTabComplete || tabLocked
  // The header title mirrors the General Information course title — lock it
  // whenever General itself is locked (Course Selection).
  const titleLocked = editableTabNos != null && !editableTabNos.includes('general')
  const tabValue = dirty ? pendingData : tabCache[activeTabNo]?.data ?? null

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[var(--border)] bg-[var(--surface)]">
        <Breadcrumb
          className="mb-2"
          items={courseCategoryCrumbs({
            scopeLabel,
            listPath,
            courseTitle,
            detailPath: returnPath,
            categoryLabel: 'Course Information',
          })}
        />
        <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleClose}
            className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-muted hover:text-primary bg-transparent border-none cursor-pointer p-0"
          >
            <HiOutlineArrowLeft className="text-[14px]" />
            Back
          </button>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-accent-light text-accent text-[10.5px] font-bold tracking-[0.07em]">
            <HiOutlineDocumentText className="text-[11px]" />
            Course Information
          </div>
          {headerEdit && !titleLocked ? (
            <input
              autoFocus
              className="h-8 px-2 rounded-[6px] bg-surface text-primary text-[14px] font-bold outline-none border border-[var(--border)]"
              value={titleInput}
              onChange={(e) => setTitleInput(e.target.value)}
              onBlur={handleTitleBlur}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleTitleBlur()
              }}
            />
          ) : (
            <h1
              className={`text-[15px] font-bold text-primary ${
                titleLocked ? '' : 'cursor-pointer hover:underline'
              }`}
              onClick={titleLocked ? undefined : () => setHeaderEdit(true)}
            >
              {courseTitle || 'Untitled Course'}
            </h1>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold text-muted tracking-[0.06em] uppercase">Status</span>
          <span
            className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold"
            style={{
              background:
                status === 'complete'
                  ? 'rgba(34,197,94,0.10)'
                  : status === 'draft'
                  ? 'rgba(245,158,11,0.12)'
                  : 'rgba(59,130,246,0.10)',
              color:
                status === 'complete'
                  ? '#16A34A'
                  : status === 'draft'
                  ? '#D97706'
                  : '#2563EB',
            }}
          >
            {status}
          </span>
        </div>
        </div>
      </div>

      <EditorProgressBar editableTabNos={editableTabNos} />
      <TabBar editableTabNos={editableTabNos} />

      <div className="flex flex-col flex-1 min-w-0 min-h-0">
        <div className="flex-1 overflow-y-auto thin-scrollbar-light bg-[var(--surface)]">
          {loading && (
            <div className="flex items-center justify-center h-full text-muted text-[13px]">
              Loading…
            </div>
          )}
          {!loading && (
            <>
              {tabLocked && !isTabComplete && currentTabDef?.implemented && (
                <div className="flex items-center gap-2 px-6 py-3 border-b border-[var(--border)] bg-[rgba(59,130,246,0.06)]">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[rgba(59,130,246,0.12)] text-[#2563EB] text-[11px] font-semibold">
                    Locked
                  </span>
                  <span className="text-[12.5px] text-muted">
                    Inherited from the course master and read-only here. Only Lesson Creation can be edited.
                  </span>
                </div>
              )}
              {isTabComplete && currentTabDef?.implemented && (
                <div className="flex items-center justify-between gap-3 px-6 py-3 border-b border-[var(--border)] bg-[rgba(34,197,94,0.06)]">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[rgba(34,197,94,0.12)] text-[#16A34A] text-[11px] font-semibold">
                      Completed
                    </span>
                    <span className="text-[12.5px] text-muted">
                      {masterApproved
                        ? 'Course is approved. This tab is locked and cannot be unmarked.'
                        : 'All fields are locked. Unmark to edit.'}
                    </span>
                  </div>
                  {!masterApproved && (
                    <button
                      type="button"
                      onClick={handleUnmarkComplete}
                      className="px-3 py-1.5 rounded-[8px] bg-[var(--surface)] border border-[var(--border)] text-[var(--text-primary)] text-[12px] font-semibold cursor-pointer hover:bg-[var(--surface-2)] transition-colors"
                    >
                      Unmark Complete
                    </button>
                  )}
                </div>
              )}
              <div
                className="m-0 p-0 min-w-0"
                style={isReadOnly ? { opacity: 0.85 } : undefined}
              >
                <ActiveTabComponent
                  value={tabValue}
                  onChange={(next) => markDirty(next)}
                  onMarkComplete={handleMarkComplete}
                  readOnly={isReadOnly}
                  reloadToken={optionsReloadToken}
                  courseInfoId={courseInfoId}
                />
              </div>
            </>
          )}
        </div>
        <EditorFooter
          onSaveDraft={handleSaveDraft}
          onNavigate={handleNavigate}
          onClose={handleClose}
          onSaveAndClose={handleSaveAndClose}
          onImport={() => setShowImport(true)}
          canImport={
            (activeTabNo === 'general' ||
              activeTabNo === 'resources' ||
              activeTabNo === 'lesson_planning' ||
              activeTabNo === 'lesson_creation') &&
            !isReadOnly
          }
          readOnly={isReadOnly}
          isSaving={isSaving}
          isSavingDraft={isSavingDraft}
          lastAutoSavedAt={lastAutoSavedAt}
        />
      </div>

      <ImportDocxModal
        open={showImport}
        onClose={() => setShowImport(false)}
        onImport={handleImportFile}
        title={
          activeTabNo === 'resources'
            ? 'Import Resources'
            : activeTabNo === 'lesson_planning'
            ? 'Import Lesson Planning'
            : activeTabNo === 'lesson_creation'
            ? 'Import Lesson Creation'
            : 'Import General Information'
        }
        description={
          activeTabNo === 'resources'
            ? 'Upload a Course Resources Word file (3.4 - Course Resources.docx) to fill in the form.'
            : activeTabNo === 'lesson_planning'
            ? 'Upload an Instructional Scalar Word file (2.3 - Instructional Scalar.docx) to import TO, EO and TP.'
            : activeTabNo === 'lesson_creation'
            ? 'Upload the Detailed Syllabus (2.5 - Detailed Syllabus.docx) and Instructional Scalar (2.3 - Instructional Scalar.docx) to build the lessons.'
            : 'Upload a General Course Information Word file (1.1 General Course Information.docx) to fill in the form.'
        }
        slots={
          activeTabNo === 'lesson_creation'
            ? [
                { id: 'syllabus', label: 'Detailed Syllabus (lesson list)' },
                { id: 'scalar', label: 'Instructional Scalar (TO / EO / TP)' },
              ]
            : undefined
        }
      />
    </div>
  )
}
