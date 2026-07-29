import { useEffect, useState } from 'react'
import { type ComboBoxOption } from '../../../../../infra/shared/components/ComboBox'
import {
  createResourceOption,
  listResourceOptions,
} from '../../api'
import type { TabProps } from './types'
import CardSection from '../components/CardSection'
import MultiAddSection from '../components/MultiAddSection'

export interface InstructorQualificationRequirementItem {
  instructorQualificationRequirementId: number | string | null
}

export interface PersonnelRequirementData {
  maximumTraineesNumber?: number | string | null
  minimumTraineesNumber?: number | string | null
  instructorsToTraineesRatioFlight?: string | null
  instructorsToTraineesRatioClassroom?: string | null
  instructorsToTraineesRatioPractical?: string | null
  instructorQualificationRequirements?: InstructorQualificationRequirementItem[] | string[] | null
}

interface FormState {
  maximumTraineesNumber: string
  minimumTraineesNumber: string
  instructorsToTraineesRatioFlight: string
  instructorsToTraineesRatioClassroom: string
  instructorsToTraineesRatioPractical: string
  instructorQualificationRequirements: Array<{ id: string }>
}

const emptyState: FormState = {
  maximumTraineesNumber: '',
  minimumTraineesNumber: '',
  instructorsToTraineesRatioFlight: '',
  instructorsToTraineesRatioClassroom: '',
  instructorsToTraineesRatioPractical: '',
  instructorQualificationRequirements: [],
}

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

function toFormState(value: PersonnelRequirementData | null | undefined): FormState {
  if (!value) return { ...emptyState }
  const num = (v: unknown) => (v == null || v === '' ? '' : String(v))
  const str = (v: unknown) => (v == null ? '' : String(v))

  let iqr: Array<{ id: string }> = []
  const raw = value.instructorQualificationRequirements
  if (Array.isArray(raw)) {
    if (raw.length > 0 && typeof raw[0] === 'string') {
      iqr = []
    } else {
      iqr = (raw as InstructorQualificationRequirementItem[])
        .map((it) => ({ id: String(it.instructorQualificationRequirementId ?? '') }))
        .filter((it) => it.id !== '')
    }
  }

  return {
    maximumTraineesNumber: num(value.maximumTraineesNumber),
    minimumTraineesNumber: num(value.minimumTraineesNumber),
    instructorsToTraineesRatioFlight: str(value.instructorsToTraineesRatioFlight),
    instructorsToTraineesRatioClassroom: str(value.instructorsToTraineesRatioClassroom),
    instructorsToTraineesRatioPractical: str(value.instructorsToTraineesRatioPractical),
    instructorQualificationRequirements: iqr,
  }
}

function toWire(formState: FormState): PersonnelRequirementData {
  return {
    maximumTraineesNumber: formState.maximumTraineesNumber || null,
    minimumTraineesNumber: formState.minimumTraineesNumber || null,
    instructorsToTraineesRatioFlight: formState.instructorsToTraineesRatioFlight || null,
    instructorsToTraineesRatioClassroom: formState.instructorsToTraineesRatioClassroom || null,
    instructorsToTraineesRatioPractical: formState.instructorsToTraineesRatioPractical || null,
    instructorQualificationRequirements: formState.instructorQualificationRequirements
      .map((it) => ({ instructorQualificationRequirementId: it.id === '' ? null : Number(it.id) }))
      .filter((it) => it.instructorQualificationRequirementId !== null),
  }
}

function allowOnlyInt(e: React.KeyboardEvent<HTMLInputElement>) {
  if (['e', 'E', '-', '+', '.'].includes(e.key)) {
    e.preventDefault()
  }
}

export default function PersonnelRequirementTab({
  value,
  onChange,
  onMarkComplete,
  readOnly,
}: TabProps<PersonnelRequirementData>) {
  const [data, setData] = useState<FormState>(() => toFormState(value))
  const [errors, setErrors] = useState<Record<string, boolean>>({})
  const [pendingId, setPendingId] = useState('')
  const [options, setOptions] = useState<ComboBoxOption[]>([])

  useEffect(() => {
    setData((prev) => {
      const prevWire = toWire(prev)
      if (
        prevWire.maximumTraineesNumber === value?.maximumTraineesNumber &&
        prevWire.minimumTraineesNumber === value?.minimumTraineesNumber &&
        prevWire.instructorsToTraineesRatioFlight === value?.instructorsToTraineesRatioFlight &&
        prevWire.instructorsToTraineesRatioClassroom === value?.instructorsToTraineesRatioClassroom &&
        prevWire.instructorsToTraineesRatioPractical === value?.instructorsToTraineesRatioPractical &&
        JSON.stringify(prevWire.instructorQualificationRequirements) === JSON.stringify(value?.instructorQualificationRequirements)
      ) {
        return prev
      }
      return toFormState(value)
    })
  }, [value])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const resp = await listResourceOptions('instructor_qualification_requirement')
        if (cancelled) return
        if (resp.success && resp.data) {
          const opts: ComboBoxOption[] = resp.data.map((o: any) => ({
            value: String(o.id),
            label: o.label,
          }))
          setOptions(opts)
        }
      } catch {
        // Empty list is fine — the combo box just shows "No matches".
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const update = (patch: Partial<FormState>) => {
    const next = { ...data, ...patch }
    setData(next)
    onChange(toWire(next))
    const key = Object.keys(patch)[0]
    if (key && errors[key]) {
      setErrors((prev) => ({ ...prev, [key]: false }))
    }
  }

  const onCreate = async (label: string) => {
    const resp = await createResourceOption('instructor_qualification_requirement', label)
    const created: ComboBoxOption =
      resp.success && resp.data
        ? { value: String(resp.data.id), label: resp.data.label }
        : { value: label, label }
    setOptions((prev) => {
      if (prev.some((o) => o.value === created.value)) return prev
      return [...prev, created].sort((a, b) => a.label.localeCompare(b.label))
    })
    return created
  }

  const labelFor = (id: string): string =>
    options.find((o) => o.value === id)?.label ?? '—'

  const validateRatioField = (field: keyof FormState) => {
    const value = data[field]
    if (typeof value === 'string') {
      setErrors((prev) => ({ ...prev, [field]: !isValidRatio(value) }))
    }
  }

  const inputCls =
    'h-9 px-3 rounded-[8px] bg-[var(--surface-2)] text-primary text-[13px] outline-none border border-[var(--border)] focus:border-[var(--accent)] transition-colors'
  const labelCls = 'text-[11.5px] font-semibold text-secondary'
  const errorCls = 'border-red-500 focus:border-red-500'

  return (
    <div className="flex flex-col gap-6 p-6">
      <header className="flex items-center justify-between pb-3 border-b border-[var(--border)]">
        <div>
          <h2 className="text-[18px] font-bold text-primary">Personnel Requirement</h2>
          <p className="text-[12px] text-muted mt-0.5">
            Trainee class sizes, instructor ratios, and instructor qualifications.
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

      <CardSection title="Trainee Counts" subtitle="Class size bounds for a single run of this course.">
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className={labelCls}>Maximum Trainees Number</label>
            <input
              type="number"
              min={0}
              step={1}
              className={inputCls}
              value={data.maximumTraineesNumber}
              onChange={(e) => update({ maximumTraineesNumber: e.target.value })}
              onKeyDown={allowOnlyInt}
              placeholder="Maximum number of trainees"
              disabled={readOnly}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className={labelCls}>Minimum Trainees Number</label>
            <input
              type="number"
              min={0}
              step={1}
              className={inputCls}
              value={data.minimumTraineesNumber}
              onChange={(e) => update({ minimumTraineesNumber: e.target.value })}
              onKeyDown={allowOnlyInt}
              placeholder="Minimum number of trainees"
              disabled={readOnly}
            />
          </div>
        </div>
      </CardSection>

      <CardSection
        title="Instructor Ratios"
        subtitle="Use the format number:number, e.g. 1:5 means one instructor per five trainees."
      >
        <div className="grid grid-cols-3 gap-4">
          {[
            { key: 'instructorsToTraineesRatioFlight'    as const, label: 'Flight Training', ph: 'e.g. 1:5' },
            { key: 'instructorsToTraineesRatioClassroom' as const, label: 'Classroom',       ph: 'e.g. 1:12' },
            { key: 'instructorsToTraineesRatioPractical' as const, label: 'Practical',       ph: 'e.g. 1:8' },
          ].map((f) => (
            <div key={f.key} className="flex flex-col gap-1.5">
              <label className={labelCls}>{f.label}</label>
              <input
                className={`${inputCls} ${errors[f.key] ? errorCls : ''}`}
                value={data[f.key]}
                onChange={(e) => update({ [f.key]: e.target.value } as Partial<FormState>)}
                onKeyDown={allowOnlyRatio}
                onBlur={() => validateRatioField(f.key)}
                placeholder={f.ph}
                disabled={readOnly}
              />
              {errors[f.key] && (
                <span className="text-[11px] text-red-500">
                  Format must be number:number (e.g. {f.ph.replace('e.g. ', '')})
                </span>
              )}
            </div>
          ))}
        </div>
      </CardSection>

      <CardSection
        title="Instructor Qualification Requirements"
        subtitle="Qualifications instructors must hold to teach this course."
        countBadge={data.instructorQualificationRequirements.length}
      >
        <MultiAddSection
          pendingId={pendingId}
          setPendingId={setPendingId}
          options={options}
          onAdd={() => {
            if (
              pendingId === '' ||
              data.instructorQualificationRequirements.some((it) => it.id === pendingId)
            )
              return
            update({
              instructorQualificationRequirements: [
                ...data.instructorQualificationRequirements,
                { id: pendingId },
              ],
            })
            setPendingId('')
          }}
          onRemove={(idx) => {
            const next = data.instructorQualificationRequirements.filter((_, i) => i !== idx)
            update({ instructorQualificationRequirements: next })
          }}
          onCreate={onCreate}
          entityLabel="instructor qualification requirement"
          items={data.instructorQualificationRequirements}
          optionLabelFor={labelFor}
          readOnly={readOnly}
        />
      </CardSection>
    </div>
  )
}
