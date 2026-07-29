import { useEffect, useState } from 'react'
import { type ComboBoxOption } from '../../../../../infra/shared/components/ComboBox'
import {
  createResourceOption,
  listResourceOptions,
} from '../../api'
import type { TabProps } from './types'
import CardSection from '../components/CardSection'
import MultiAddSection from '../components/MultiAddSection'

const FREQUENCY_OPTIONS = ['Daily', 'Weekly', 'Mon–Fri', 'Weekends', 'Custom']

export interface CourseEntryStandardItem {
  courseEntryStandardId: number | string | null
}

export interface GeneralInformationData {
  courseTitle?: string | null
  courseDuration?: number | string | null
  programmedWorkingHours?: {
    frequency?: string | null
    startTime?: string | null
    endTime?: string | null
  } | null
  ctpVersion?: string | null
  courseAim?: string | null
  courseEntryStandard?: CourseEntryStandardItem[] | string[] | null
}

interface FormState {
  courseTitle: string
  courseDuration: string
  programmedWorkingFrequency: string
  programmedWorkingStartTime: string
  programmedWorkingEndTime: string
  ctpVersion: string
  courseAim: string
  courseEntryStandard: Array<{ id: string }>
}

const emptyState: FormState = {
  courseTitle: '',
  courseDuration: '',
  programmedWorkingFrequency: '',
  programmedWorkingStartTime: '',
  programmedWorkingEndTime: '',
  ctpVersion: '',
  courseAim: '',
  courseEntryStandard: [],
}

function toFormState(value: GeneralInformationData | null | undefined): FormState {
  if (!value) return { ...emptyState }
  const num = (v: unknown) => (v == null || v === '' ? '' : String(v))
  const str = (v: unknown) => (v == null ? '' : String(v))

  let entry: Array<{ id: string }> = []
  const raw = value.courseEntryStandard
  if (Array.isArray(raw)) {
    if (raw.length > 0 && typeof raw[0] === 'string') {
      entry = []
    } else {
      entry = (raw as CourseEntryStandardItem[])
        .map((it) => ({ id: String(it.courseEntryStandardId ?? '') }))
        .filter((it) => it.id !== '')
    }
  }

  const pwh = value.programmedWorkingHours
  return {
    courseTitle: str(value.courseTitle),
    courseDuration: num(value.courseDuration),
    programmedWorkingFrequency: str(pwh?.frequency),
    programmedWorkingStartTime: str(pwh?.startTime),
    programmedWorkingEndTime: str(pwh?.endTime),
    ctpVersion: str(value.ctpVersion),
    courseAim: str(value.courseAim),
    courseEntryStandard: entry,
  }
}

function toWire(formState: FormState): GeneralInformationData {
  return {
    courseTitle: formState.courseTitle || null,
    courseDuration: formState.courseDuration || null,
    programmedWorkingHours: {
      frequency: formState.programmedWorkingFrequency || null,
      startTime: formState.programmedWorkingStartTime || null,
      endTime: formState.programmedWorkingEndTime || null,
    },
    ctpVersion: formState.ctpVersion || null,
    courseAim: formState.courseAim || null,
    courseEntryStandard: formState.courseEntryStandard
      .map((it) => ({ courseEntryStandardId: it.id === '' ? null : Number(it.id) }))
      .filter((it) => it.courseEntryStandardId !== null),
  }
}

function allowOnlyInt(e: React.KeyboardEvent<HTMLInputElement>) {
  if (['e', 'E', '-', '+', '.'].includes(e.key)) {
    e.preventDefault()
  }
}

export default function GeneralInformationTab({
  value,
  onChange,
  onMarkComplete,
  readOnly,
  reloadToken,
}: TabProps<GeneralInformationData>) {
  const [data, setData] = useState<FormState>(() => toFormState(value))
  const [pendingId, setPendingId] = useState('')
  const [options, setOptions] = useState<ComboBoxOption[]>([])

  useEffect(() => {
    setData((prev) => {
      const prevWire = toWire(prev)
      if (
        prevWire.courseTitle === value?.courseTitle &&
        prevWire.courseDuration === value?.courseDuration &&
        prevWire.ctpVersion === value?.ctpVersion &&
        prevWire.courseAim === value?.courseAim &&
        JSON.stringify(prevWire.programmedWorkingHours) === JSON.stringify(value?.programmedWorkingHours) &&
        JSON.stringify(prevWire.courseEntryStandard) === JSON.stringify(value?.courseEntryStandard)
      ) {
        return prev
      }
      return toFormState(value)
    })
  }, [value])

  // Load entry-standard options on mount, and reload after a .docx import
  // (reloadToken bump). The cleanup flips `cancelled`, so a stale in-flight
  // load can't overwrite freshly imported options.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const resp = await listResourceOptions('course_entry_standard')
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
  }, [reloadToken])

  const update = (patch: Partial<FormState>) => {
    const next = { ...data, ...patch }
    setData(next)
    onChange(toWire(next))
  }

  const onCreate = async (label: string) => {
    const resp = await createResourceOption('course_entry_standard', label)
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

  const inputCls =
    'h-9 px-3 rounded-[8px] bg-[var(--surface-2)] text-primary text-[13px] outline-none border border-[var(--border)] focus:border-[var(--accent)] transition-colors'
  const textareaCls =
    'px-3 py-2 rounded-[8px] bg-[var(--surface-2)] text-primary text-[13px] outline-none border border-[var(--border)] focus:border-[var(--accent)] resize-none transition-colors'
  const labelCls = 'text-[11.5px] font-semibold text-secondary'

  return (
    <div className="flex flex-col gap-6 p-6">
      <header className="flex items-center justify-between pb-3 border-b border-[var(--border)]">
        <div>
          <h2 className="text-[18px] font-bold text-primary">General Information</h2>
          <p className="text-[12px] text-muted mt-0.5">
            Basic course details, scheduling, and pre-requisites.
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

      <CardSection title="Basic Details" subtitle="Title, version, duration, and working hours.">
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className={labelCls}>Course Title</label>
            <input
              className={inputCls}
              value={data.courseTitle}
              onChange={(e) => update({ courseTitle: e.target.value })}
              placeholder="Enter course title"
              disabled={readOnly}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className={labelCls}>CTP Version</label>
            <input
              className={inputCls}
              value={data.ctpVersion}
              onChange={(e) => update({ ctpVersion: e.target.value })}
              placeholder="e.g. 1.0"
              disabled={readOnly}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className={labelCls}>Course Duration (training days)</label>
            <input
              type="number"
              min={0}
              step={1}
              className={inputCls}
              value={data.courseDuration}
              onChange={(e) => update({ courseDuration: e.target.value })}
              onKeyDown={allowOnlyInt}
              placeholder="Number of training days"
              disabled={readOnly}
            />
          </div>

          <div className="col-span-2 flex flex-col gap-1.5">
            <label className={labelCls}>Programmed Working Hours</label>
            <div className="grid grid-cols-3 gap-3">
              <select
                className={inputCls}
                value={data.programmedWorkingFrequency}
                onChange={(e) => update({ programmedWorkingFrequency: e.target.value })}
                disabled={readOnly}
              >
                <option value="">Select frequency</option>
                {FREQUENCY_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
              <input
                type="time"
                className={inputCls}
                value={data.programmedWorkingStartTime}
                onChange={(e) => update({ programmedWorkingStartTime: e.target.value })}
                placeholder="Start time"
                disabled={readOnly}
              />
              <input
                type="time"
                className={inputCls}
                value={data.programmedWorkingEndTime}
                onChange={(e) => update({ programmedWorkingEndTime: e.target.value })}
                placeholder="End time"
                disabled={readOnly}
              />
            </div>
          </div>
        </div>
      </CardSection>

      <CardSection title="Course Aim" subtitle="A short description of what the course is meant to achieve.">
        <textarea
          className={textareaCls}
          rows={4}
          value={data.courseAim}
          onChange={(e) => update({ courseAim: e.target.value })}
          placeholder="Describe the aim of the course"
          disabled={readOnly}
        />
      </CardSection>

      <CardSection
        title="Course Entry Standards"
        subtitle="Pre-requisites trainees must meet before joining the course."
        countBadge={data.courseEntryStandard.length}
      >
        <MultiAddSection
          pendingId={pendingId}
          setPendingId={setPendingId}
          options={options}
          onAdd={() => {
            if (pendingId === '' || data.courseEntryStandard.some((it) => it.id === pendingId)) return
            update({
              courseEntryStandard: [...data.courseEntryStandard, { id: pendingId }],
            })
            setPendingId('')
          }}
          onRemove={(idx) => {
            const next = data.courseEntryStandard.filter((_, i) => i !== idx)
            update({ courseEntryStandard: next })
          }}
          onCreate={onCreate}
          entityLabel="course entry standard"
          items={data.courseEntryStandard}
          optionLabelFor={labelFor}
          readOnly={readOnly}
        />
      </CardSection>
    </div>
  )
}
