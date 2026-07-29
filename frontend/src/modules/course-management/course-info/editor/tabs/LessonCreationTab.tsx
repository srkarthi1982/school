import { useEffect, useMemo, useRef, useState } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  HiOutlineArrowLeft,
  HiOutlineBars3,
  HiOutlineExclamationTriangle,
  HiOutlinePencilSquare,
  HiOutlinePlus,
  HiOutlineTrash,
} from 'react-icons/hi2'
import ComboBox, { type ComboBoxOption } from '../../../../../infra/shared/components/ComboBox'
import { generateId } from '../../../../../infra/shared/utils/uid'
import {
  createResourceOption,
  listResourceOptions,
  type LessonAssociations,
  type LessonResourceCategoryOption,
} from '../../api'
import { useCourseInfoApi } from '../ApiContext'
import useEditorStore from '../editor-store'
import ModifiedBadge from '../../../_shared/ModifiedBadge'
import LessonSearch from './LessonSearch'
import type { TabProps } from './types'

export interface LessonUnitItem {
  trainingObjectiveId?: number | string | null
  enablingObjectiveId?: number | string | null
  teachingPointId?: number | string | null
}

export interface LessonResourceItem {
  category?: string | null
  resourceId?: number | string | null
}

export type ConductPart = 'BEGINNING' | 'MIDDLE' | 'END'

export interface LessonConductItem {
  part?: string | null
  point?: string | null
  material?: string | null
  notes?: string | null
}

export interface LessonItem {
  id?: number | null
  lessonNumber?: string | null
  lessonTitle?: string | null
  environmentId?: number | string | null
  periodTypeId?: number | string | null
  flightTiming?: string | null
  periodPerUnit?: number | string | null
  instructorStudentRatio?: string | null
  location?: string | null
  healthAndSafety?: string | null
  units?: LessonUnitItem[] | null
  resources?: LessonResourceItem[] | null
  conducts?: LessonConductItem[] | null
}

export interface LessonCreationData {
  lessons: LessonItem[]
}

interface UnitRow {
  id: string
  trainingObjectiveId: string
  enablingObjectiveId: string
  teachingPointId: string
}

interface ResourceRow {
  id: string
  category: string
  resourceId: string
}

interface ConductRow {
  id: string
  part: ConductPart
  point: string
  material: string
  notes: string
}

interface LessonRow {
  id: string
  // Persistent backend lesson id (course_info_lesson_creation_lessons.id).
  // Round-tripped so the server can upsert in place and keep linked material.
  backendId: number | null
  lessonNumber: string
  lessonTitle: string
  environmentId: string
  periodTypeId: string
  flightTiming: string
  periodPerUnit: string
  instructorStudentRatio: string
  location: string
  healthAndSafety: string
  units: UnitRow[]
  resources: ResourceRow[]
  conducts: ConductRow[]
}

const CONDUCT_PARTS: ConductPart[] = ['BEGINNING', 'MIDDLE', 'END']

interface FormState {
  lessons: LessonRow[]
}

type Mode =
  | { kind: 'list' }
  | { kind: 'detail'; rowId: string; isNew: boolean }

const COMBO_KINDS = [
  'environment',
  'type_of_period',
  'training_objective',
  'enabling_objective',
  'teaching_point',
] as const

function makeEmptyUnit(): UnitRow {
  return {
    id: generateId(),
    trainingObjectiveId: '',
    enablingObjectiveId: '',
    teachingPointId: '',
  }
}

function makeEmptyResource(): ResourceRow {
  return {
    id: generateId(),
    category: '',
    resourceId: '',
  }
}

function makeEmptyConduct(part: ConductPart): ConductRow {
  return {
    id: generateId(),
    part,
    point: '',
    material: '',
    notes: '',
  }
}

function makeEmptyRow(): LessonRow {
  return {
    id: generateId(),
    backendId: null,
    lessonNumber: '',
    lessonTitle: '',
    environmentId: '',
    periodTypeId: '',
    flightTiming: '',
    periodPerUnit: '',
    instructorStudentRatio: '',
    location: '',
    healthAndSafety: '',
    units: [],
    resources: [],
    conducts: [],
  }
}

function unitsFromWire(items: LessonUnitItem[] | null | undefined): UnitRow[] {
  if (!items || items.length === 0) return []
  return items.map((u) => ({
    id: generateId(),
    trainingObjectiveId: u.trainingObjectiveId == null ? '' : String(u.trainingObjectiveId),
    enablingObjectiveId: u.enablingObjectiveId == null ? '' : String(u.enablingObjectiveId),
    teachingPointId: u.teachingPointId == null ? '' : String(u.teachingPointId),
  }))
}

function resourcesFromWire(items: LessonResourceItem[] | null | undefined): ResourceRow[] {
  if (!items || items.length === 0) return []
  return items.map((r) => ({
    id: generateId(),
    category: r.category == null ? '' : String(r.category),
    resourceId: r.resourceId == null ? '' : String(r.resourceId),
  }))
}

function conductsFromWire(items: LessonConductItem[] | null | undefined): ConductRow[] {
  if (!items || items.length === 0) return []
  return items.map((c) => {
    const part = String(c.part ?? '').toUpperCase()
    return {
      id: generateId(),
      part: (CONDUCT_PARTS.includes(part as ConductPart) ? part : 'BEGINNING') as ConductPart,
      point: c.point ?? '',
      material: c.material ?? '',
      notes: c.notes ?? '',
    }
  })
}

// Ratio "1:8" — mirrors the validation used on the Personnel Requirement tab.
function isValidRatio(value: string): boolean {
  if (!value) return true
  return /^\d+:\d+$/.test(value)
}

function allowOnlyRatio(e: React.KeyboardEvent<HTMLInputElement>) {
  if (e.ctrlKey || e.metaKey || e.altKey) return
  if (['Backspace', 'Tab', 'Enter', 'Escape', 'Delete', 'ArrowLeft', 'ArrowRight', 'Home', 'End', ':'].includes(e.key)) return
  if (/^\d$/.test(e.key)) return
  e.preventDefault()
}

function toFormState(value: LessonCreationData | null | undefined): FormState {
  if (!value || !value.lessons || value.lessons.length === 0) {
    return { lessons: [] }
  }
  return {
    lessons: value.lessons.map((item) => ({
      id: generateId(),
      backendId: item.id ?? null,
      lessonNumber: item.lessonNumber ?? '',
      lessonTitle: item.lessonTitle ?? '',
      environmentId: item.environmentId == null ? '' : String(item.environmentId),
      periodTypeId: item.periodTypeId == null ? '' : String(item.periodTypeId),
      flightTiming: String(item.flightTiming ?? ''),
      periodPerUnit: String(item.periodPerUnit ?? ''),
      instructorStudentRatio: item.instructorStudentRatio ?? '',
      location: item.location ?? '',
      healthAndSafety: item.healthAndSafety ?? '',
      units: unitsFromWire(item.units),
      resources: resourcesFromWire(item.resources),
      conducts: conductsFromWire(item.conducts),
    })),
  }
}

function toWire(state: FormState): LessonCreationData {
  return {
    lessons: state.lessons.map((row) => ({
      id: row.backendId ?? null,
      lessonNumber: row.lessonNumber || null,
      lessonTitle: row.lessonTitle || null,
      environmentId: row.environmentId || null,
      periodTypeId: row.periodTypeId || null,
      flightTiming: row.flightTiming || null,
      periodPerUnit: row.periodPerUnit || null,
      instructorStudentRatio: row.instructorStudentRatio || null,
      location: row.location || null,
      healthAndSafety: row.healthAndSafety || null,
      units: row.units
        .filter(
          (u) => u.trainingObjectiveId || u.enablingObjectiveId || u.teachingPointId,
        )
        .map((u) => ({
          trainingObjectiveId: u.trainingObjectiveId || null,
          enablingObjectiveId: u.enablingObjectiveId || null,
          teachingPointId: u.teachingPointId || null,
        })),
      resources: row.resources
        .filter((r) => r.category && r.resourceId)
        .map((r) => ({
          category: r.category || null,
          resourceId: r.resourceId || null,
        })),
      conducts: row.conducts
        .filter((c) => c.point || c.material || c.notes)
        .map((c) => ({
          part: c.part,
          point: c.point || null,
          material: c.material || null,
          notes: c.notes || null,
        })),
    })),
  }
}

// ─── List view row ──────────────────────────────────────────────────────────

interface SortableListRowProps {
  row: LessonRow
  index: number
  optionsByKind: Record<string, ComboBoxOption[]>
  readOnly?: boolean
  // True when this (instance) lesson's content has drifted from the master it
  // was cloned from — renders a "Modified" marker. Course Builder never sets it.
  modified?: boolean
  // True while this row is the active search result — flashes + scrolls in.
  highlighted?: boolean
  // True while this row's associations are being checked before removal.
  removing?: boolean
  onEdit: (rowId: string) => void
  onRemove: (rowId: string) => void
}

function labelFor(
  optionsByKind: Record<string, ComboBoxOption[]>,
  kind: string,
  value: string,
): string {
  if (!value) return ''
  const opt = (optionsByKind[kind] ?? []).find((o) => o.value === value)
  return opt?.label ?? ''
}

// Total Units is derived, not stored: Total Period / Period per Unit. Returns ''
// when either input is missing/non-numeric or the divisor is zero. Whole
// results render as integers; otherwise rounded to 2 decimals.
function computeTotalUnits(totalPeriod: string, periodPerUnit: string): string {
  const tp = Number(totalPeriod)
  const ppu = Number(periodPerUnit)
  if (!totalPeriod || !periodPerUnit || !Number.isFinite(tp) || !Number.isFinite(ppu) || ppu === 0) {
    return ''
  }
  const result = tp / ppu
  return Number.isInteger(result) ? String(result) : String(Math.round(result * 100) / 100)
}

function SortableListRow({
  row,
  index,
  optionsByKind,
  readOnly,
  modified = false,
  highlighted = false,
  removing = false,
  onEdit,
  onRemove,
}: SortableListRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: row.id })

  const elRef = useRef<HTMLDivElement | null>(null)
  const setRefs = (el: HTMLDivElement | null) => {
    elRef.current = el
    setNodeRef(el)
  }

  // Bring the row into view when it becomes the active search result.
  useEffect(() => {
    if (!highlighted) return
    elRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [highlighted])

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
  }

  const cellCls = 'px-3 py-2 text-[13px] text-primary truncate'

  return (
    <div
      ref={setRefs}
      style={style}
      className={`grid grid-cols-[36px_100px_minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_90px_90px_80px_70px_88px] items-center gap-1 px-2 py-1.5 rounded-[10px] border bg-[var(--surface)] transition-all ${
        highlighted
          ? 'border-[var(--accent)] shadow-[0_0_0_3px_var(--accent-light)]'
          : 'border-[var(--border)] hover:border-[var(--accent)] hover:shadow-xs'
      }`}
    >
      {!readOnly ? (
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="h-9 w-9 inline-flex items-center justify-center rounded-[8px] text-muted cursor-grab active:cursor-grabbing hover:text-primary transition-colors"
          aria-label="Drag to reorder"
        >
          <HiOutlineBars3 className="text-[16px]" />
        </button>
      ) : (
        <span />
      )}

      <div className={cellCls}>{row.lessonNumber || <span className="text-muted">—</span>}</div>
      <div className="px-3 py-2 text-[13px] text-primary flex items-center gap-1.5 min-w-0">
        <span className="truncate">
          {row.lessonTitle || <span className="text-muted">—</span>}
        </span>
        {modified && <ModifiedBadge />}
      </div>
      <div className={cellCls}>
        {labelFor(optionsByKind, 'environment', row.environmentId) || (
          <span className="text-muted">—</span>
        )}
      </div>
      <div className={cellCls}>
        {labelFor(optionsByKind, 'type_of_period', row.periodTypeId) || (
          <span className="text-muted">—</span>
        )}
      </div>
      <div className={cellCls}>
        {row.flightTiming || <span className="text-muted">—</span>}
      </div>
      <div className={cellCls}>
        {row.periodPerUnit || <span className="text-muted">—</span>}
      </div>
      <div className={cellCls}>
        {computeTotalUnits(row.flightTiming, row.periodPerUnit) || (
          <span className="text-muted">—</span>
        )}
      </div>
      <div className={cellCls}>{row.units.length}</div>

      <div className="flex items-center gap-1 justify-end pr-1">
        <button
          type="button"
          onClick={() => onEdit(row.id)}
          className="h-9 w-9 inline-flex items-center justify-center rounded-[8px] bg-[var(--surface)] border border-[var(--border)] text-muted cursor-pointer hover:text-accent transition-colors"
          aria-label="Edit lesson"
        >
          <HiOutlinePencilSquare className="text-[14px]" />
        </button>
        {!readOnly && (
          <button
            type="button"
            onClick={() => onRemove(row.id)}
            disabled={removing}
            className="h-9 w-9 inline-flex items-center justify-center rounded-[8px] bg-[var(--surface)] border border-[var(--border)] text-muted cursor-pointer hover:text-[#DC2626] hover:bg-[rgba(220,38,38,0.06)] transition-colors disabled:opacity-40 disabled:cursor-wait"
            aria-label="Remove lesson"
          >
            <HiOutlineTrash className="text-[14px]" />
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Detail view ────────────────────────────────────────────────────────────

interface DetailViewProps {
  initialRow: LessonRow
  isNew: boolean
  optionsByKind: Record<string, ComboBoxOption[]>
  resourceCategories: LessonResourceCategoryOption[]
  makeCreateHandler: (kind: string) => (label: string) => Promise<ComboBoxOption>
  readOnly?: boolean
  onCancel: () => void
  onSave: (row: LessonRow) => void
}

function DetailView({
  initialRow,
  isNew,
  optionsByKind,
  resourceCategories,
  makeCreateHandler,
  readOnly,
  onCancel,
  onSave,
}: DetailViewProps) {
  const [draft, setDraft] = useState<LessonRow>(initialRow)
  const [ratioError, setRatioError] = useState(false)

  const update = (patch: Partial<LessonRow>) => setDraft((d) => ({ ...d, ...patch }))

  const inputCls =
    'h-9 px-3 rounded-[8px] bg-surface text-primary text-[13px] outline-none border border-[var(--border)]'
  const conductTextareaCls =
    'min-h-[84px] px-3 py-2 rounded-[8px] bg-surface text-primary text-[13px] leading-[1.5] outline-none border border-[var(--border)] resize-y disabled:opacity-60'
  const labelCls = 'text-[11.5px] font-semibold text-secondary'

  const addUnit = () => update({ units: [...draft.units, makeEmptyUnit()] })
  const removeUnit = (id: string) =>
    update({ units: draft.units.filter((u) => u.id !== id) })
  const updateUnit = (id: string, patch: Partial<UnitRow>) =>
    update({
      units: draft.units.map((u) => (u.id === id ? { ...u, ...patch } : u)),
    })

  const addResource = () => update({ resources: [...draft.resources, makeEmptyResource()] })
  const removeResource = (id: string) =>
    update({ resources: draft.resources.filter((r) => r.id !== id) })
  const updateResource = (id: string, patch: Partial<ResourceRow>) =>
    update({
      resources: draft.resources.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    })

  const addConduct = (part: ConductPart) =>
    update({ conducts: [...draft.conducts, makeEmptyConduct(part)] })
  const removeConduct = (id: string) =>
    update({ conducts: draft.conducts.filter((c) => c.id !== id) })
  const updateConduct = (id: string, patch: Partial<ConductRow>) =>
    update({
      conducts: draft.conducts.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    })

  // Category combo options + a lookup from category -> its resource options.
  const categoryOptions: ComboBoxOption[] = resourceCategories.map((c) => ({
    value: c.category,
    label: c.categoryLabel,
  }))
  const resourceOptionsFor = (category: string): ComboBoxOption[] => {
    const cat = resourceCategories.find((c) => c.category === category)
    return cat ? cat.resources.map((r) => ({ value: String(r.id), label: r.label })) : []
  }

  const handleSave = () => {
    if (!isValidRatio(draft.instructorStudentRatio)) {
      setRatioError(true)
      return
    }
    onSave(draft)
  }

  return (
    <div className="flex flex-col gap-5 p-6">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-1.5 px-2 py-1 rounded-[8px] text-secondary text-[13px] font-semibold bg-transparent border-none cursor-pointer hover:text-primary transition-colors"
        >
          <HiOutlineArrowLeft className="text-[14px]" />
          Back to list
        </button>
        <h2 className="text-[16px] font-bold text-primary">
          {isNew ? 'New Lesson' : 'Edit Lesson'}
        </h2>
        <span className="w-[110px]" />
      </div>

      <section className="flex flex-col gap-3 p-4 rounded-[10px] border border-[var(--border)] bg-[var(--surface)]">
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className={labelCls}>Lesson Number</label>
            <input
              className={inputCls}
              value={draft.lessonNumber}
              onChange={(e) => update({ lessonNumber: e.target.value })}
              placeholder="e.g. 1"
              disabled={readOnly}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelCls}>Lesson Title</label>
            <input
              className={inputCls}
              value={draft.lessonTitle}
              onChange={(e) => update({ lessonTitle: e.target.value })}
              placeholder="Enter lesson title"
              disabled={readOnly}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelCls}>Environment</label>
            <ComboBox
              value={draft.environmentId}
              options={optionsByKind['environment'] ?? []}
              onChange={(v) => update({ environmentId: v })}
              onCreate={makeCreateHandler('environment')}
              entityLabel="environment"
              placeholder="Select or add"
              disabled={readOnly}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelCls}>Period Type</label>
            <ComboBox
              value={draft.periodTypeId}
              options={optionsByKind['type_of_period'] ?? []}
              onChange={(v) => update({ periodTypeId: v })}
              onCreate={makeCreateHandler('type_of_period')}
              entityLabel="period type"
              placeholder="Select or add"
              disabled={readOnly}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelCls}>Total Period</label>
            <input
              type="number"
              className={inputCls}
              value={draft.flightTiming}
              onChange={(e) => update({ flightTiming: e.target.value })}
              disabled={readOnly}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelCls}>Period per Unit</label>
            <input
              type="number"
              min={1}
              className={inputCls}
              value={draft.periodPerUnit}
              onChange={(e) => update({ periodPerUnit: e.target.value })}
              placeholder="Periods per block unit"
              disabled={readOnly}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelCls}>Instructor / Student Ratio</label>
            <input
              className={inputCls}
              value={draft.instructorStudentRatio}
              onChange={(e) => {
                update({ instructorStudentRatio: e.target.value })
                if (ratioError) setRatioError(false)
              }}
              onKeyDown={allowOnlyRatio}
              onBlur={() => setRatioError(!isValidRatio(draft.instructorStudentRatio))}
              placeholder="e.g. 1:8"
              disabled={readOnly}
            />
            {ratioError && (
              <span className="text-[11px] text-[#DC2626]">
                Format must be number:number (e.g. 1:8)
              </span>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelCls}>Location</label>
            <input
              className={inputCls}
              value={draft.location}
              onChange={(e) => update({ location: e.target.value })}
              placeholder="e.g. Classroom"
              disabled={readOnly}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className={labelCls}>Health &amp; Safety</label>
          <textarea
            className="px-3 py-2 rounded-[8px] bg-surface text-primary text-[13px] outline-none border border-[var(--border)] resize-y min-h-[72px]"
            value={draft.healthAndSafety}
            onChange={(e) => update({ healthAndSafety: e.target.value })}
            placeholder="Health & safety information for this lesson"
            disabled={readOnly}
          />
        </div>
      </section>

      <section className="flex flex-col gap-2 p-4 rounded-[10px] border border-[var(--border)] bg-[var(--surface)]">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-[14px] font-bold text-primary">Objectives and Teaching Point</h3>
          {!readOnly && (
            <button
              type="button"
              onClick={addUnit}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] bg-accent-light text-accent text-[12px] font-semibold border-none cursor-pointer hover:opacity-90 transition-opacity"
            >
              <HiOutlinePlus className="text-[13px]" />
              Add Unit
            </button>
          )}
        </div>

        {draft.units.length === 0 ? (
          <div className="text-[13px] text-muted py-3 text-center">
            No units yet — click <span className="font-semibold">Add Unit</span> to start.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {draft.units.map((unit, idx) => (
              <div
                key={unit.id}
                className="flex items-end gap-2 p-2 rounded-[8px] border border-[var(--border)]"
              >
                <div className="w-14 flex flex-col gap-1">
                  <label className={labelCls}>Unit</label>
                  <div className="h-9 px-3 inline-flex items-center text-[13px] text-primary">
                    {idx + 1}
                  </div>
                </div>

                <div className="flex flex-col gap-1 flex-1 min-w-0">
                  <label className={labelCls}>Training Objective</label>
                  <ComboBox
                    value={unit.trainingObjectiveId}
                    options={optionsByKind['training_objective'] ?? []}
                    onChange={(v) => updateUnit(unit.id, { trainingObjectiveId: v })}
                    placeholder="Select"
                    disabled={readOnly}
                  />
                </div>

                <div className="flex flex-col gap-1 flex-1 min-w-0">
                  <label className={labelCls}>Enabling Objective</label>
                  <ComboBox
                    value={unit.enablingObjectiveId}
                    options={optionsByKind['enabling_objective'] ?? []}
                    onChange={(v) => updateUnit(unit.id, { enablingObjectiveId: v })}
                    placeholder="Select"
                    disabled={readOnly}
                  />
                </div>

                <div className="flex flex-col gap-1 flex-1 min-w-0">
                  <label className={labelCls}>Teaching Point</label>
                  <ComboBox
                    value={unit.teachingPointId}
                    options={optionsByKind['teaching_point'] ?? []}
                    onChange={(v) => updateUnit(unit.id, { teachingPointId: v })}
                    placeholder="Select"
                    disabled={readOnly}
                  />
                </div>

                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => removeUnit(unit.id)}
                    className="h-9 w-9 inline-flex items-center justify-center rounded-[8px] bg-[var(--surface)] border border-[var(--border)] text-muted cursor-pointer hover:text-[#DC2626] hover:bg-[rgba(220,38,38,0.06)] transition-colors"
                    aria-label="Remove unit"
                  >
                    <HiOutlineTrash className="text-[14px]" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2 p-4 rounded-[10px] border border-[var(--border)] bg-[var(--surface)]">
        <div className="flex items-center justify-between mb-1">
          <div>
            <h3 className="text-[14px] font-bold text-primary">Resources</h3>
            <p className="text-[11.5px] text-muted mt-0.5">
              Pick a category, then a resource added on the Resources tab.
            </p>
          </div>
          {!readOnly && (
            <button
              type="button"
              onClick={addResource}
              disabled={categoryOptions.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] bg-accent-light text-accent text-[12px] font-semibold border-none cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <HiOutlinePlus className="text-[13px]" />
              Add Resource
            </button>
          )}
        </div>

        {categoryOptions.length === 0 ? (
          <div className="text-[13px] text-muted py-3 text-center">
            No resources available — add resources on the{' '}
            <span className="font-semibold">Resources</span> tab first.
          </div>
        ) : draft.resources.length === 0 ? (
          <div className="text-[13px] text-muted py-3 text-center">
            No resources yet — click <span className="font-semibold">Add Resource</span> to start.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {draft.resources.map((res) => (
              <div
                key={res.id}
                className="flex items-end gap-2 p-2 rounded-[8px] border border-[var(--border)]"
              >
                <div className="flex flex-col gap-1 flex-1 min-w-0">
                  <label className={labelCls}>Category</label>
                  <ComboBox
                    value={res.category}
                    options={categoryOptions}
                    // Changing category invalidates the previously picked resource.
                    onChange={(v) => updateResource(res.id, { category: v, resourceId: '' })}
                    placeholder="Select category"
                    disabled={readOnly}
                  />
                </div>

                <div className="flex flex-col gap-1 flex-1 min-w-0">
                  <label className={labelCls}>Resource</label>
                  <ComboBox
                    value={res.resourceId}
                    options={resourceOptionsFor(res.category)}
                    onChange={(v) => updateResource(res.id, { resourceId: v })}
                    placeholder={res.category ? 'Select resource' : 'Select category first'}
                    disabled={readOnly || !res.category}
                  />
                </div>

                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => removeResource(res.id)}
                    className="h-9 w-9 inline-flex items-center justify-center rounded-[8px] bg-[var(--surface)] border border-[var(--border)] text-muted cursor-pointer hover:text-[#DC2626] hover:bg-[rgba(220,38,38,0.06)] transition-colors"
                    aria-label="Remove resource"
                  >
                    <HiOutlineTrash className="text-[14px]" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3 p-4 rounded-[10px] border border-[var(--border)] bg-[var(--surface)]">
        <div>
          <h3 className="text-[14px] font-bold text-primary">Conduct</h3>
          <p className="text-[11.5px] text-muted mt-0.5">
            Lesson conduct, organised into Beginning, Middle and End.
          </p>
        </div>

        {CONDUCT_PARTS.map((part) => {
          const rows = draft.conducts.filter((c) => c.part === part)
          return (
            <div
              key={part}
              className="rounded-[10px] border border-[var(--border)] bg-[var(--surface-2)] p-3 flex flex-col gap-2"
            >
              <div className="flex items-center justify-between">
                <span className="px-2 py-0.5 rounded-[6px] bg-accent-light text-accent text-[11px] font-bold tracking-wide">
                  {part}
                </span>
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => addConduct(part)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[8px] bg-accent-light text-accent text-[11.5px] font-semibold border-none cursor-pointer hover:opacity-90 transition-opacity"
                  >
                    <HiOutlinePlus className="text-[12px]" />
                    Add Record
                  </button>
                )}
              </div>

              {rows.length === 0 ? (
                <div className="text-[12px] text-muted py-2 text-center">
                  No records for {part.toLowerCase()}.
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {rows.map((rec) => (
                    <div
                      key={rec.id}
                      className="flex items-start gap-2 p-2 rounded-[8px] border border-[var(--border)] bg-[var(--surface)]"
                    >
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 flex-1 min-w-0">
                        <div className="flex flex-col gap-1">
                          <label className={labelCls}>Point</label>
                          <textarea
                            className={conductTextareaCls}
                            rows={3}
                            value={rec.point}
                            onChange={(e) => updateConduct(rec.id, { point: e.target.value })}
                            placeholder="Point"
                            disabled={readOnly}
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className={labelCls}>Reference Material</label>
                          <textarea
                            className={conductTextareaCls}
                            rows={3}
                            value={rec.material}
                            onChange={(e) => updateConduct(rec.id, { material: e.target.value })}
                            placeholder="Reference Material"
                            disabled={readOnly}
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className={labelCls}>Notes</label>
                          <textarea
                            className={conductTextareaCls}
                            rows={3}
                            value={rec.notes}
                            onChange={(e) => updateConduct(rec.id, { notes: e.target.value })}
                            placeholder="Notes"
                            disabled={readOnly}
                          />
                        </div>
                      </div>

                      {!readOnly && (
                        <button
                          type="button"
                          onClick={() => removeConduct(rec.id)}
                          className="mt-[22px] h-9 w-9 inline-flex items-center justify-center rounded-[8px] bg-[var(--surface)] border border-[var(--border)] text-muted cursor-pointer hover:text-[#DC2626] hover:bg-[rgba(220,38,38,0.06)] transition-colors flex-none"
                          aria-label="Remove conduct record"
                        >
                          <HiOutlineTrash className="text-[14px]" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </section>

      <div className="sticky bottom-0 -mx-6 -mb-6 mt-1 flex items-center justify-end gap-2 px-6 py-3 bg-[var(--surface)] border-t border-[var(--border)] shadow-[0_-1px_0_rgba(0,0,0,0.04),0_-8px_16px_-8px_rgba(0,0,0,0.06)]">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-1.5 rounded-[8px] bg-transparent text-secondary text-[13px] font-semibold border border-[var(--border)] cursor-pointer hover:text-primary transition-colors"
        >
          {readOnly ? 'Back to list' : 'Cancel'}
        </button>
        {!readOnly && (
          <button
            type="button"
            onClick={handleSave}
            className="px-4 py-1.5 rounded-[8px] bg-accent text-white text-[13px] font-semibold border-none cursor-pointer hover:opacity-90 transition-opacity"
          >
            {isNew ? 'Save Lesson' : 'Save Changes'}
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Remove-lesson confirmation (warn when the lesson is still in use) ───────

interface RemovalTarget {
  rowId: string
  label: string
  // null when the association check failed — we still confirm so a lesson with
  // possible downstream links is never deleted silently.
  associations: LessonAssociations | null
}

const ASSOCIATION_CATEGORIES: ReadonlyArray<{ key: keyof LessonAssociations; label: string }> = [
  { key: 'material', label: 'Material' },
  { key: 'formBuilder', label: 'Form Builder' },
  { key: 'evaluation', label: 'Evaluation' },
  { key: 'schedule', label: 'Schedule' },
]

function RemoveLessonModal({
  target,
  onCancel,
  onConfirm,
}: {
  target: RemovalTarget
  onCancel: () => void
  onConfirm: () => void
}) {
  const { associations, label } = target
  const breakdown = associations
    ? ASSOCIATION_CATEGORIES.filter((c) => (associations[c.key] as number) > 0).map(
        (c) => ({ label: c.label, count: associations[c.key] as number }),
      )
    : []

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-[440px] rounded-[12px] bg-[var(--surface)] border border-[var(--border)] shadow-xl p-5 flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <span className="h-9 w-9 shrink-0 inline-flex items-center justify-center rounded-full bg-[rgba(220,38,38,0.10)] text-[#DC2626]">
            <HiOutlineExclamationTriangle className="text-[18px]" />
          </span>
          <div className="flex flex-col gap-1">
            <h3 className="text-[15px] font-bold text-primary">Remove this lesson?</h3>
            <p className="text-[13px] text-secondary">
              {associations ? (
                <>
                  <span className="font-semibold text-primary">{label || 'This lesson'}</span> is
                  associated with other categories. Removing it will also remove those
                  associations.
                </>
              ) : (
                <>
                  We couldn&apos;t verify whether{' '}
                  <span className="font-semibold text-primary">{label || 'this lesson'}</span> is
                  used by other categories. Removing it may also remove associated material, forms,
                  evaluations or schedule entries.
                </>
              )}
            </p>
          </div>
        </div>

        {breakdown.length > 0 && (
          <ul className="flex flex-col gap-1 rounded-[8px] bg-[var(--surface-2)] border border-[var(--border)] p-3">
            {breakdown.map((b) => (
              <li key={b.label} className="flex items-center justify-between text-[12.5px]">
                <span className="text-secondary">{b.label}</span>
                <span className="font-semibold text-primary">{b.count}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-1.5 rounded-[8px] bg-transparent text-secondary text-[13px] font-semibold border border-[var(--border)] cursor-pointer hover:text-primary transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-4 py-1.5 rounded-[8px] bg-[#DC2626] text-white text-[13px] font-semibold border-none cursor-pointer hover:opacity-90 transition-opacity"
          >
            Remove anyway
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main tab ───────────────────────────────────────────────────────────────

export default function LessonCreationTab({
  value,
  onChange,
  onMarkComplete,
  readOnly,
  reloadToken,
  courseInfoId,
}: TabProps<LessonCreationData>) {
  const api = useCourseInfoApi()
  const setEditingSubItem = useEditorStore((s) => s.setEditingSubItem)
  const [data, setData] = useState<FormState>(() => toFormState(value))
  const [optionsByKind, setOptionsByKind] = useState<Record<string, ComboBoxOption[]>>({})
  const [resourceCategories, setResourceCategories] = useState<LessonResourceCategoryOption[]>([])
  const [mode, setMode] = useState<Mode>({ kind: 'list' })
  // Backend ids of instance lessons that have drifted from the master. Only
  // populated in Course Selection (the master api exposes no drift endpoint), so
  // the "Modified" badge never shows in Course Builder.
  const [modifiedIds, setModifiedIds] = useState<Set<number>>(new Set())
  // Row flashed after a lesson search; auto-clears below.
  const [highlightId, setHighlightId] = useState<string | null>(null)
  // Lesson pending removal confirmation because it's still linked elsewhere.
  const [removalTarget, setRemovalTarget] = useState<RemovalTarget | null>(null)
  // Row whose associations are being looked up (disables its trash button).
  const [checkingId, setCheckingId] = useState<string | null>(null)

  useEffect(() => {
    if (!highlightId) return
    const t = setTimeout(() => setHighlightId(null), 2500)
    return () => clearTimeout(t)
  }, [highlightId])

  // While the detail view is open, tell the editor footer to hide its Save
  // controls and lock tab navigation — the lesson's own Save/Cancel are the
  // only actions that should apply to the in-progress lesson. Always clear the
  // flag on unmount so leaving the tab mid-edit can't strand the footer.
  useEffect(() => {
    setEditingSubItem(mode.kind === 'detail')
    return () => setEditingSubItem(false)
  }, [mode.kind, setEditingSubItem])

  // Sync from parent (e.g. after server save) while preserving stable row ids
  // when the lesson count hasn't changed. Cheap to compare on basic fields.
  useEffect(() => {
    setData((prev) => {
      const incoming = value?.lessons
      if (!incoming || incoming.length === 0) {
        return prev.lessons.length === 0 ? prev : { lessons: [] }
      }
      if (prev.lessons.length !== incoming.length) {
        return toFormState(value)
      }
      return {
        lessons: prev.lessons.map((row, i) => {
          const inc = incoming[i]
          return {
            id: row.id,
            backendId: inc.id ?? row.backendId ?? null,
            lessonNumber: inc.lessonNumber ?? '',
            lessonTitle: inc.lessonTitle ?? '',
            environmentId: inc.environmentId == null ? '' : String(inc.environmentId),
            periodTypeId: inc.periodTypeId == null ? '' : String(inc.periodTypeId),
            flightTiming: String(inc.flightTiming ?? ''),
            periodPerUnit: String(inc.periodPerUnit ?? ''),
            instructorStudentRatio: inc.instructorStudentRatio ?? '',
            location: inc.location ?? '',
            healthAndSafety: inc.healthAndSafety ?? '',
            units: unitsFromWire(inc.units),
            resources: resourcesFromWire(inc.resources),
            conducts: conductsFromWire(inc.conducts),
          }
        }),
      }
    })
  }, [value])

  // Load option dictionaries on mount, and reload after a .docx import
  // (reloadToken bump). The cleanup flips `cancelled`, so a stale in-flight
  // load can't overwrite freshly imported options.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      for (const kind of COMBO_KINDS) {
        try {
          const resp = await listResourceOptions(kind)
          if (cancelled) return
          if (resp.success && resp.data) {
            const opts: ComboBoxOption[] = resp.data.map((o) => ({
              value: String(o.id),
              label: o.label,
            }))
            setOptionsByKind((prev) => ({ ...prev, [kind]: opts }))
          }
        } catch {
          // Empty dictionary is fine
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [reloadToken])

  // Load the per-lesson resource picklist, scoped to this course's Resources
  // tab. Reloads on reloadToken so newly-added resources surface here too.
  useEffect(() => {
    if (!courseInfoId) return
    let cancelled = false
    ;(async () => {
      try {
        const resp = await api.listLessonResourceOptions(courseInfoId)
        if (cancelled) return
        if (resp.success && resp.data) setResourceCategories(resp.data)
      } catch {
        // No resources yet is fine — the section shows an empty-state hint.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [api, courseInfoId, reloadToken])

  // Load which lessons have drifted from the master (Course Selection only). The
  // backend compares persisted content, so this reflects the last saved state:
  // re-runs on mount, after a .docx import (reloadToken), and whenever `value`
  // changes — i.e. after the editor round-trips a save with fresh server data.
  // Debounced so keystroke-level `value` churn (unsaved edits, which the backend
  // can't see yet anyway) collapses into a single request once editing pauses.
  const fetchModified = api.getLessonCreationModifiedLessons
  useEffect(() => {
    if (!fetchModified || !courseInfoId) return
    let cancelled = false
    const t = setTimeout(async () => {
      try {
        const resp = await fetchModified(courseInfoId)
        if (cancelled) return
        if (resp.success && resp.data) {
          setModifiedIds(new Set(resp.data.modified_lesson_ids))
        }
      } catch {
        // Non-critical: on failure the badge simply doesn't show.
      }
    }, 400)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [fetchModified, courseInfoId, reloadToken, value])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const commit = (next: FormState) => {
    setData(next)
    onChange(toWire(next))
  }

  const makeCreateHandler = (kind: string) => async (label: string) => {
    const resp = await createResourceOption(kind, label)
    const created: ComboBoxOption = resp.success && resp.data
      ? { value: String(resp.data.id), label: resp.data.label }
      : { value: label, label }
    setOptionsByKind((prev) => {
      const existing = prev[kind] ?? []
      if (existing.some((o) => o.value === created.value)) return prev
      return {
        ...prev,
        [kind]: [...existing, created].sort((a, b) => a.label.localeCompare(b.label)),
      }
    })
    return created
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (over && active.id !== over.id) {
      const oldIndex = data.lessons.findIndex((r) => r.id === active.id)
      const newIndex = data.lessons.findIndex((r) => r.id === over.id)
      commit({ lessons: arrayMove(data.lessons, oldIndex, newIndex) })
    }
  }

  const removeRow = (rowId: string) => {
    commit({ lessons: data.lessons.filter((r) => r.id !== rowId) })
  }

  // Removing a persisted lesson cascades any linked Material / Form Builder /
  // Evaluation / Schedule records away, so check first and warn if it's still
  // in use. New (unsaved) rows have no backendId and can't have associations.
  const handleRemove = async (rowId: string) => {
    const row = data.lessons.find((r) => r.id === rowId)
    if (!row) return
    if (row.backendId == null || !courseInfoId) {
      removeRow(rowId)
      return
    }
    const label = row.lessonTitle || row.lessonNumber || ''
    setCheckingId(rowId)
    try {
      const resp = await api.getLessonAssociations(courseInfoId, row.backendId)
      if (resp.success && resp.data && resp.data.total > 0) {
        setRemovalTarget({ rowId, label, associations: resp.data })
      } else {
        removeRow(rowId)
      }
    } catch {
      // Couldn't verify — confirm rather than risk a silent cascade delete.
      setRemovalTarget({ rowId, label, associations: null })
    } finally {
      setCheckingId(null)
    }
  }

  const confirmRemoval = () => {
    if (removalTarget) removeRow(removalTarget.rowId)
    setRemovalTarget(null)
  }

  const handleAdd = () => {
    const fresh = makeEmptyRow()
    // Stage the new row in local state so DetailView can edit it. We do NOT
    // call onChange yet — the row only "exists" once the user clicks Save in
    // the detail view (an empty row would be filtered on persist anyway).
    setData((prev) => ({ lessons: [...prev.lessons, fresh] }))
    setMode({ kind: 'detail', rowId: fresh.id, isNew: true })
  }

  const handleEdit = (rowId: string) => {
    setMode({ kind: 'detail', rowId, isNew: false })
  }

  // Jump to a searched lesson: flash it (the row scrolls itself into view when
  // its `highlighted` prop turns on).
  const handleSearchSelect = (rowId: string) => setHighlightId(rowId)

  const handleDetailSave = (updated: LessonRow) => {
    const next = {
      lessons: data.lessons.map((r) => (r.id === updated.id ? updated : r)),
    }
    commit(next)
    setMode({ kind: 'list' })
  }

  const handleDetailCancel = () => {
    if (mode.kind !== 'detail') return
    if (mode.isNew) {
      // Drop the freshly-staged empty row without notifying the parent.
      setData((prev) => ({
        lessons: prev.lessons.filter((r) => r.id !== mode.rowId),
      }))
    }
    setMode({ kind: 'list' })
  }

  const editingRow = useMemo(() => {
    if (mode.kind !== 'detail') return null
    return data.lessons.find((r) => r.id === mode.rowId) ?? null
  }, [mode, data.lessons])

  // ── Detail view ─────────
  if (mode.kind === 'detail' && editingRow) {
    return (
      <DetailView
        initialRow={editingRow}
        isNew={mode.isNew}
        optionsByKind={optionsByKind}
        resourceCategories={resourceCategories}
        makeCreateHandler={makeCreateHandler}
        readOnly={readOnly}
        onCancel={handleDetailCancel}
        onSave={handleDetailSave}
      />
    )
  }

  // ── List view ─────────
  const headerCellCls = 'px-3 py-1 text-[11.5px] font-semibold text-secondary uppercase tracking-wide'

  return (
    <div className="flex flex-col gap-6 p-6">
      <header className="flex items-center justify-between pb-3 border-b border-[var(--border)]">
        <div>
          <h2 className="text-[18px] font-bold text-primary">Lesson Creation</h2>
          <p className="text-[12px] text-muted mt-0.5">
            Lessons run in the order shown. Drag the handle to reorder, click a row to edit details.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {data.lessons.length > 0 && (
            <LessonSearch
              lessons={data.lessons}
              optionsByKind={optionsByKind}
              onSelect={handleSearchSelect}
            />
          )}
          {!readOnly && (
            <button
              type="button"
              onClick={onMarkComplete}
              className="px-3 py-1.5 rounded-[8px] bg-[rgba(34,197,94,0.10)] text-[#16A34A] text-[12px] font-semibold border-none cursor-pointer hover:bg-[rgba(34,197,94,0.18)] transition-colors"
            >
              Mark Complete
            </button>
          )}
        </div>
      </header>

      <div className="grid grid-cols-[36px_100px_minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_90px_90px_80px_70px_88px] items-center gap-1 px-2">
        <span />
        <span className={headerCellCls}>Code</span>
        <span className={headerCellCls}>Title</span>
        <span className={headerCellCls}>Environment</span>
        <span className={headerCellCls}>Period Type</span>
        <span className={headerCellCls}>Total Period</span>
        <span className={headerCellCls}>Period per Unit</span>
        <span className={headerCellCls}>Total Units</span>
        <span className={headerCellCls}>Teaching Point</span>
        <span />
      </div>

      {data.lessons.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-10 rounded-[10px] border border-dashed border-[var(--border)] bg-[var(--surface-2)]">
          <p className="text-[13px] text-muted">No lessons yet — start by adding your first one.</p>
          {!readOnly && (
            <button
              type="button"
              onClick={handleAdd}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] bg-accent-light text-accent text-[12px] font-semibold border-none cursor-pointer hover:opacity-90 transition-opacity"
            >
              <HiOutlinePlus className="text-[13px]" />
              Add Lesson
            </button>
          )}
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={data.lessons.map((r) => r.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="flex flex-col gap-2">
              {data.lessons.map((row, idx) => (
                <SortableListRow
                  key={row.id}
                  row={row}
                  index={idx}
                  optionsByKind={optionsByKind}
                  readOnly={readOnly}
                  modified={row.backendId != null && modifiedIds.has(row.backendId)}
                  highlighted={row.id === highlightId}
                  removing={row.id === checkingId}
                  onEdit={handleEdit}
                  onRemove={handleRemove}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {!readOnly && (
        <button
          type="button"
          onClick={handleAdd}
          className="self-start inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] bg-accent-light text-accent text-[12px] font-semibold border-none cursor-pointer hover:opacity-90 transition-opacity"
        >
          <HiOutlinePlus className="text-[13px]" />
          Add Lesson
        </button>
      )}

      {removalTarget && (
        <RemoveLessonModal
          target={removalTarget}
          onCancel={() => setRemovalTarget(null)}
          onConfirm={confirmRemoval}
        />
      )}
    </div>
  )
}
