import { useEffect, useRef, useState } from 'react'
import { type ComboBoxOption } from '../../../../../infra/shared/components/ComboBox'
import {
  createResourceOption,
  listResourceOptions,
} from '../../api'
import type { TabProps } from './types'
import CardSection from '../components/CardSection'
import MultiAddSection from '../components/MultiAddSection'

export interface TeachingPointItem {
  teachingPointId?: number | string | null
  [key: string]: unknown
}

export interface EnablingObjectiveItem {
  enablingObjectiveId?: number | string | null
  [key: string]: unknown
}

export interface TrainingObjectiveItem {
  trainingObjectiveId?: number | string | null
  [key: string]: unknown
}

export interface TypeOfPeriodItem {
  typeOfPeriodId?: number | string | null
  [key: string]: unknown
}

export interface ClassificationOfPeriodItem {
  classificationOfPeriodId?: number | string | null
  [key: string]: unknown
}

export interface EnvironmentItem {
  environmentId?: number | string | null
  [key: string]: unknown
}

export interface LessonPlanningData {
  numberOfPeriodsPerDay?: number | string | null
  numberOfTrainingDaysPerWeek?: number | string | null
  numberOfPeriodsPerHalfDay?: number | string | null
  periodDurationMinutes?: number | string | null
  trainingObjectives?: TrainingObjectiveItem[] | null
  enablingObjectives?: EnablingObjectiveItem[] | null
  teachingPoints?: TeachingPointItem[] | null
  typeOfPeriods?: TypeOfPeriodItem[] | null
  classificationOfPeriods?: ClassificationOfPeriodItem[] | null
  environments?: EnvironmentItem[] | null
}

type ComboFieldDef = {
  kind: string
  label: string
  entityLabel: string
  listKey: 'typeOfPeriodIds' | 'classificationOfPeriodIds' | 'environmentIds'
        | 'trainingObjectiveIds' | 'enablingObjectiveIds' | 'teachingPointIds'
}

const COMBO_FIELDS: readonly ComboFieldDef[] = [
  { kind: 'type_of_period',           label: 'Type of Period',             entityLabel: 'period type',           listKey: 'typeOfPeriodIds' },
  { kind: 'classification_of_period', label: 'Classification of Period',   entityLabel: 'period classification', listKey: 'classificationOfPeriodIds' },
  { kind: 'environment',              label: 'Environment',                entityLabel: 'environment',           listKey: 'environmentIds' },
  { kind: 'training_objective',       label: 'Training Objective (TO)',    entityLabel: 'training objective',    listKey: 'trainingObjectiveIds' },
  { kind: 'enabling_objective',       label: 'Enabling Objective (EO)',    entityLabel: 'enabling objective',    listKey: 'enablingObjectiveIds' },
  { kind: 'teaching_point',           label: 'Teaching Point (TP)',        entityLabel: 'teaching point',        listKey: 'teachingPointIds' },
] as const

function idsFromWire(items: Array<Record<string, unknown>> | null | undefined, idKey: string): string[] {
  if (!items) return []
  return items
    .map((it) => {
      const v = it[idKey]
      return v == null || v === '' ? '' : String(v)
    })
    .filter(Boolean)
}

interface Form {
  numberOfPeriodsPerDay: string
  numberOfTrainingDaysPerWeek: string
  numberOfPeriodsPerHalfDay: string
  periodDurationMinutes: string
  trainingObjectiveIds: string[]
  enablingObjectiveIds: string[]
  teachingPointIds: string[]
  typeOfPeriodIds: string[]
  classificationOfPeriodIds: string[]
  environmentIds: string[]
}

const emptyForm: Form = {
  numberOfPeriodsPerDay: '',
  numberOfTrainingDaysPerWeek: '',
  numberOfPeriodsPerHalfDay: '',
  periodDurationMinutes: '',
  trainingObjectiveIds: [],
  enablingObjectiveIds: [],
  teachingPointIds: [],
  typeOfPeriodIds: [],
  classificationOfPeriodIds: [],
  environmentIds: [],
}

function toForm(value: LessonPlanningData | null | undefined): Form {
  if (!value) return emptyForm
  const n = (v: unknown) => (v == null || v === '' ? '' : String(v))
  return {
    numberOfPeriodsPerDay: n(value.numberOfPeriodsPerDay),
    numberOfTrainingDaysPerWeek: n(value.numberOfTrainingDaysPerWeek),
    numberOfPeriodsPerHalfDay: n(value.numberOfPeriodsPerHalfDay),
    periodDurationMinutes: n(value.periodDurationMinutes),
    trainingObjectiveIds: idsFromWire(value.trainingObjectives, 'trainingObjectiveId'),
    enablingObjectiveIds: idsFromWire(value.enablingObjectives, 'enablingObjectiveId'),
    teachingPointIds: idsFromWire(value.teachingPoints, 'teachingPointId'),
    typeOfPeriodIds: idsFromWire(value.typeOfPeriods, 'typeOfPeriodId'),
    classificationOfPeriodIds: idsFromWire(value.classificationOfPeriods, 'classificationOfPeriodId'),
    environmentIds: idsFromWire(value.environments, 'environmentId'),
  }
}

function allowInt(e: React.KeyboardEvent<HTMLInputElement>) {
  if (['e', 'E', '-', '+', '.'].includes(e.key)) e.preventDefault()
}

// Half-day field: integers or a single half step (x.0 / x.5). Blocks scientific
// notation and signs; the '.' is allowed but onChange enforces the .0/.5 grid.
function allowHalf(e: React.KeyboardEvent<HTMLInputElement>) {
  if (['e', 'E', '-', '+'].includes(e.key)) e.preventDefault()
}

// Permits "", "5", "5.", "5.0", "5.5", "12.5" — rejects "5.7", "5.55", "5.50".
const HALF_DAY_RE = /^\d*(\.[05]?)?$/

const inputCls =
  'h-9 px-3 rounded-[8px] bg-[var(--surface-2)] text-primary text-[13px] outline-none border border-[var(--border)] focus:border-[var(--accent)] transition-colors'
const labelCls = 'text-[11.5px] font-semibold text-secondary'

export default function LessonPlanningTab({ value, onChange, onMarkComplete, readOnly, reloadToken }: TabProps<LessonPlanningData>) {
  const [form, setForm] = useState<Form>(() => toForm(value))
  const [optionsByKind, setOptionsByKind] = useState<Record<string, ComboBoxOption[]>>({})
  const [pendingIds, setPendingIds] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {}
    for (const f of COMBO_FIELDS) initial[f.kind] = ''
    return initial
  })
  const syncedRef = useRef<string | null>(null)

  useEffect(() => {
    if (!value) { setForm(emptyForm); syncedRef.current = null; return }
    const key = JSON.stringify({
      to: value.trainingObjectives?.map((i) => i.trainingObjectiveId) ?? [],
      eo: value.enablingObjectives?.map((i) => i.enablingObjectiveId) ?? [],
      tp: value.teachingPoints?.map((i) => i.teachingPointId) ?? [],
      tp_p: value.typeOfPeriods?.map((i) => i.typeOfPeriodId) ?? [],
      cp: value.classificationOfPeriods?.map((i) => i.classificationOfPeriodId) ?? [],
      env: value.environments?.map((i) => i.environmentId) ?? [],
    })
    if (key === syncedRef.current) return
    setForm(toForm(value))
    syncedRef.current = key
  }, [value])

  // Load option dictionaries on mount, and reload after a .docx import
  // (reloadToken bump). The cleanup flips `kill`, so a stale in-flight load
  // can't overwrite freshly imported options.
  useEffect(() => {
    let kill = false
    ;(async () => {
      for (const f of COMBO_FIELDS) {
        try {
          const r = await listResourceOptions(f.kind)
          if (kill) return
          if (r.success && r.data) {
            const opts: ComboBoxOption[] = r.data.map((o: any) => ({ value: String(o.id), label: o.label }))
            setOptionsByKind((p) => ({ ...p, [f.kind]: opts }))
          }
        } catch { /* empty dict is fine */ }
      }
    })()
    return () => { kill = true }
  }, [reloadToken])

  const update = (patch: Partial<Form>) => {
    const next = { ...form, ...patch }
    setForm(next)
    onChange({
      trainingObjectives: next.trainingObjectiveIds.map((id) => ({ trainingObjectiveId: id || undefined })),
      enablingObjectives: next.enablingObjectiveIds.map((id) => ({ enablingObjectiveId: id || undefined })),
      teachingPoints: next.teachingPointIds.map((id) => ({ teachingPointId: id || undefined })),
      numberOfPeriodsPerDay: next.numberOfPeriodsPerDay || undefined,
      numberOfTrainingDaysPerWeek: next.numberOfTrainingDaysPerWeek || undefined,
      numberOfPeriodsPerHalfDay: next.numberOfPeriodsPerHalfDay || undefined,
      periodDurationMinutes: next.periodDurationMinutes || undefined,
      typeOfPeriods: next.typeOfPeriodIds.map((id) => ({ typeOfPeriodId: id || undefined })),
      classificationOfPeriods: next.classificationOfPeriodIds.map((id) => ({ classificationOfPeriodId: id || undefined })),
      environments: next.environmentIds.map((id) => ({ environmentId: id || undefined })),
    })
  }

  const makeCreate = (kind: string) => async (label: string) => {
    const resp = await createResourceOption(kind, label)
    const cr: ComboBoxOption = resp.success && resp.data
      ? { value: String(resp.data.id), label: resp.data.label }
      : { value: label, label }
    setOptionsByKind((p) => {
      const ex = p[kind] ?? []
      if (ex.some((o) => o.value === cr.value)) return p
      return { ...p, [kind]: [...ex, cr].sort((a, b) => a.label.localeCompare(b.label)) }
    })
    return cr
  }

  const addComboItem = (listKey: ComboFieldDef['listKey'], id: string) => {
    if (!id) return
    const arr = [...form[listKey]]
    if (arr.includes(id)) return
    arr.push(id)
    update({ [listKey]: arr } as Partial<Form>)
  }

  const rmComboItem = (listKey: ComboFieldDef['listKey'], idx: number) => {
    const arr = [...form[listKey]]
    arr.splice(idx, 1)
    update({ [listKey]: arr } as Partial<Form>)
  }

  const labelForKind = (kind: string, id: string) =>
    (optionsByKind[kind] ?? []).find((o) => o.value === id)?.label ?? '—'

  return (
    <div className="flex flex-col gap-6 p-6">
      <header className="flex items-center justify-between pb-3 border-b border-[var(--border)]">
        <div>
          <h2 className="text-[18px] font-bold text-primary">Lesson Planning</h2>
          <p className="text-[12px] text-muted mt-0.5">
            Daily schedule and the building blocks used to design lessons.
          </p>
        </div>
        {!readOnly && (
          <button
            type="button"
            onClick={onMarkComplete}
            className="px-3 py-1.5 rounded-[8px] bg-[rgba(34,197,94,0.10)] text-[#16A34A] text-[12px] font-semibold border-none cursor-pointer hover:bg-[rgba(34,197,94,0.18)] transition-colors"
          >
            Mark Complete
          </button>
        )}
      </header>

      <CardSection title="Schedule" subtitle="How often and how long lessons run.">
        <div className="grid grid-cols-2 gap-4">
          {[
            { key: 'numberOfPeriodsPerDay' as const, label: 'Number of Periods per Day', ph: 'e.g. 6', half: false },
            { key: 'numberOfTrainingDaysPerWeek' as const, label: 'Number of Training Days per Week', ph: 'e.g. 5.5', half: true },
            { key: 'numberOfPeriodsPerHalfDay' as const, label: 'Number of Periods per Half Day', ph: 'e.g. 3', half: false },
            { key: 'periodDurationMinutes' as const, label: 'Period Duration (minutes)', ph: 'e.g. 45', half: false },
          ].map((f) => (
            <div key={f.key} className="flex flex-col gap-1.5">
              <label className={labelCls}>{f.label}</label>
              <input
                type="number"
                min={0}
                step={f.half ? 0.5 : 1}
                className={inputCls}
                value={form[f.key]}
                onChange={(e) => {
                  const v = e.target.value
                  if (f.half && !HALF_DAY_RE.test(v)) return
                  update({ [f.key]: v })
                }}
                onKeyDown={f.half ? allowHalf : allowInt}
                placeholder={f.ph}
                disabled={readOnly}
              />
              {f.half && (
                <span className="text-[10.5px] text-muted">
                  Whole or half days only (e.g. 5 or 5.5).
                </span>
              )}
            </div>
          ))}
        </div>
      </CardSection>

      <CardSection
        title="Periods & Objectives"
        subtitle="The catalogue of period types, objectives, and teaching points available across lessons."
      >
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {COMBO_FIELDS.map((f) => (
            <div
              key={f.kind}
              className="rounded-[10px] border border-[var(--border)] bg-[var(--surface-2)] p-3 flex flex-col gap-2"
            >
              <label className={labelCls}>{f.label}</label>
              <MultiAddSection
                pendingId={pendingIds[f.kind] ?? ''}
                setPendingId={(v) => setPendingIds((p) => ({ ...p, [f.kind]: v }))}
                options={optionsByKind[f.kind] ?? []}
                onAdd={() => {
                  addComboItem(f.listKey, pendingIds[f.kind] ?? '')
                  setPendingIds((p) => ({ ...p, [f.kind]: '' }))
                }}
                onRemove={(idx) => rmComboItem(f.listKey, idx)}
                onCreate={makeCreate(f.kind)}
                entityLabel={f.entityLabel}
                items={form[f.listKey].map((id) => ({ id }))}
                optionLabelFor={(id) => labelForKind(f.kind, id)}
                readOnly={readOnly}
              />
            </div>
          ))}
        </div>
      </CardSection>
    </div>
  )
}
