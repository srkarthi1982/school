import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useShallow } from 'zustand/react/shallow'
import {
  HiOutlineExclamationCircle,
  HiOutlineTrash,
  HiOutlineXMark,
} from 'react-icons/hi2'
import { useI18n } from '../../../../infra/locales/I18nContext'
import useScheduleManagementStore, {
  selectCourses,
  selectModalOpen,
  selectModalMode,
  selectSelectedId,
  selectCreateDefault,
  selectEntries,
} from '../store'
import { importancePalette } from './ImportanceBadge'
import { toLocalISO, addMinutes, fromLocalISO } from '../utils/timeUtils'
import DateTimePicker from '../../../../infra/shared/components/DateTimePicker'
import type { ImportanceLevel, ScheduleEntryInput } from '../types'

interface Props {
  canEdit: boolean
}

interface FormState {
  course_id: number | ''
  startAt: string
  endAt: string
  title: string
  description: string
  importance: ImportanceLevel
}

function emptyForm(defaults: Partial<ScheduleEntryInput> | null): FormState {
  const now = new Date()
  now.setMinutes(0, 0, 0)
  return {
    course_id:   defaults?.course_id ?? '',
    startAt:     defaults?.startAt ? toLocalISO(fromLocalISO(defaults.startAt)) : toLocalISO(now),
    endAt:       defaults?.endAt   ? toLocalISO(fromLocalISO(defaults.endAt))   : toLocalISO(addMinutes(now, 60)),
    title:       defaults?.title       ?? '',
    description: defaults?.description ?? '',
    importance:  defaults?.importance  ?? 5,
  }
}

export default function ScheduleEntryModal({ canEdit }: Props) {
  const { t } = useI18n()
  const { open, mode, selectedId, defaults, courses, entries } = useScheduleManagementStore(
    useShallow(s => ({
      open:       selectModalOpen(s),
      mode:       selectModalMode(s),
      selectedId: selectSelectedId(s),
      defaults:   selectCreateDefault(s),
      courses:    selectCourses(s),
      entries:      selectEntries(s),
    })),
  )

  const closeModal = useScheduleManagementStore(s => s.closeModal)
  const addEntry    = useScheduleManagementStore(s => s.addEntry)
  const updateEntry = useScheduleManagementStore(s => s.updateEntry)
  const removeEntry = useScheduleManagementStore(s => s.removeEntry)

  const editing = useMemo(
    () => (mode === 'edit' && selectedId ? entries.find(t => t.id === selectedId) ?? null : null),
    [mode, selectedId, entries],
  )

  const [form, setForm] = useState<FormState>(() => emptyForm(defaults))
  const [error, setError] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  useEffect(() => {
    if (!open) return
    if (mode === 'edit' && editing) {
      setForm({
        course_id:   editing.course_id ?? '',
        startAt:     toLocalISO(new Date(editing.startAt)),
        endAt:       toLocalISO(new Date(editing.endAt)),
        title:       editing.title,
        description: editing.description,
        importance:  editing.importance,
      })
    } else {
      setForm(emptyForm(defaults))
    }
    setError(null)
    setConfirmingDelete(false)
  }, [open, mode, editing, defaults])

  if (!open) return null

  const updateField = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm(prev => ({ ...prev, [key]: value }))

  // When start changes, auto-bump end to start+1h if end is empty or ≤ start.
  // Leaves end alone when the user has already set it later than the new start.
  const handleStartChange = (value: string) => {
    setForm(prev => {
      const next = { ...prev, startAt: value }
      if (!value) return next
      const startMs = fromLocalISO(value).getTime()
      const endMs   = prev.endAt ? fromLocalISO(prev.endAt).getTime() : NaN
      if (!prev.endAt || isNaN(endMs) || endMs <= startMs) {
        next.endAt = toLocalISO(addMinutes(new Date(startMs), 60))
      }
      return next
    })
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!form.course_id) {
      setError(t('schedule.requiredCourse'))
      return
    }
    if (!form.title.trim()) {
      setError(t('schedule.requiredTitle'))
      return
    }

    const start = fromLocalISO(form.startAt)
    const end   = fromLocalISO(form.endAt)
    if (!(end.getTime() > start.getTime())) {
      setError(t('schedule.invalidTimeRange'))
      return
    }

    const payload: ScheduleEntryInput = {
      course_id:   Number(form.course_id),
      startAt:     start.toISOString(),
      endAt:       end.toISOString(),
      title:       form.title.trim(),
      description: form.description.trim(),
      importance:  form.importance,
    }

    if (mode === 'edit' && editing) {
      updateEntry(editing.id, payload)
    } else {
      addEntry(payload)
    }
    closeModal()
  }

  const handleDelete = () => {
    if (!editing) return
    if (!confirmingDelete) {
      setConfirmingDelete(true)
      return
    }
    removeEntry(editing.id)
  }

  const headerTitle = mode === 'edit'
    ? (canEdit ? t('schedule.editEntry') : t('schedule.viewEntry'))
    : t('schedule.addNew')

  const palette = importancePalette(form.importance)

  return (
    <div
      className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4"
      onClick={closeModal}
      role="dialog"
      aria-modal="true"
    >
      <form
        onSubmit={handleSubmit}
        onClick={e => e.stopPropagation()}
        className="bg-[var(--surface)] rounded-[14px] shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden"
      >
        <div
          className="px-6 py-4 flex items-center justify-between"
          style={{ background: 'linear-gradient(135deg, var(--navy) 0%, var(--navy-mid) 100%)' }}
        >
          <h2 className="text-white text-[17px] font-bold">{headerTitle}</h2>
          <button
            type="button"
            onClick={closeModal}
            className="text-white/70 hover:text-white transition-colors p-1"
            aria-label="Close"
          >
            <HiOutlineXMark className="text-[20px]" />
          </button>
        </div>

        <div className="overflow-y-auto thin-scrollbar-light p-6 flex flex-col gap-4">

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wide">
                {t('schedule.startTime')} <span className="text-red-500">*</span>
              </label>
              <DateTimePicker
                  required
                  disabled={!canEdit}
                  value={form.startAt}
                  onChange={handleStartChange}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wide">
                {t('schedule.endTime')} <span className="text-red-500">*</span>
              </label>
              <DateTimePicker
                  required
                  disabled={!canEdit}
                  value={form.endAt}
                  onChange={(v) => updateField('endAt', v)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wide">
              {t('schedule.title')} <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              disabled={!canEdit}
              value={form.title}
              onChange={e => updateField('title', e.target.value)}
              className="rounded-[10px] border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-[14px] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] disabled:opacity-70"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wide">
              {t('schedule.course')} <span className="text-red-500">*</span>
            </label>
            <select
              required
              disabled={!canEdit}
              value={form.course_id}
              onChange={e => updateField('course_id', e.target.value === '' ? '' : Number(e.target.value))}
              className="rounded-[10px] border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-[14px] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] disabled:opacity-70"
            >
              <option value="">{t('common.select')}</option>
              {courses.map(c => (
                <option key={c.id} value={c.id}>{c.code} — {c.name}</option>
              ))}
            </select>
          </div>

          {/*<div className="grid grid-cols-2 gap-3">*/}
          {/*  <div className="flex flex-col gap-1">*/}
          {/*    <label className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wide">*/}
          {/*      {t('schedule.startTime')} <span className="text-red-500">*</span>*/}
          {/*    </label>*/}
          {/*    <DateTimePicker*/}
          {/*      required*/}
          {/*      disabled={!canEdit}*/}
          {/*      value={form.startAt}*/}
          {/*      onChange={handleStartChange}*/}
          {/*    />*/}
          {/*  </div>*/}
          {/*  <div className="flex flex-col gap-1">*/}
          {/*    <label className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wide">*/}
          {/*      {t('schedule.endTime')} <span className="text-red-500">*</span>*/}
          {/*    </label>*/}
          {/*    <DateTimePicker*/}
          {/*      required*/}
          {/*      disabled={!canEdit}*/}
          {/*      value={form.endAt}*/}
          {/*      onChange={(v) => updateField('endAt', v)}*/}
          {/*    />*/}
          {/*  </div>*/}
          {/*</div>*/}

          <div className="flex items-center gap-3">
            <label className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wide shrink-0">
              {t('schedule.importance')}
            </label>
            <input
              type="range"
              min={1}
              max={10}
              disabled={!canEdit}
              value={form.importance}
              onChange={e => updateField('importance', Number(e.target.value) as ImportanceLevel)}
              className="flex-1 disabled:opacity-70"
              style={{ accentColor: palette.stripe }}
            />
            <span
              className="text-[11px] font-bold rounded-full px-2 py-0.5 shrink-0"
              style={{ background: palette.bg, color: palette.text }}
            >
              {form.importance}/10
            </span>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wide">
              {t('schedule.description')}
            </label>
            <textarea
              rows={8}
              disabled={!canEdit}
              value={form.description}
              onChange={e => updateField('description', e.target.value)}
              className="rounded-[10px] border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-[13px] text-[var(--text-primary)] resize-none focus:outline-none focus:border-[var(--accent)] disabled:opacity-70"
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm">
              <HiOutlineExclamationCircle className="text-[16px] shrink-0 mt-px" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="border-t border-[var(--border)] px-6 py-3 flex items-center justify-between gap-2 bg-[var(--surface-2)]">
          <div>
            {canEdit && mode === 'edit' && (
              <button
                type="button"
                onClick={handleDelete}
                className={`inline-flex items-center gap-1.5 text-[13px] font-semibold rounded-[10px] px-3 py-2 border transition-colors ${
                  confirmingDelete
                    ? 'bg-red-600 text-white border-red-600'
                    : 'bg-transparent text-red-600 border-red-200 hover:bg-red-50'
                }`}
              >
                <HiOutlineTrash className="text-[15px]" />
                {confirmingDelete ? t('schedule.confirmDelete') : t('schedule.deleteEntry')}
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={closeModal}
              className="text-[13px] font-semibold text-[var(--text-secondary)] rounded-[10px] px-4 py-2 hover:bg-[var(--surface)]"
            >
              {canEdit ? t('common.cancel') : t('common.close')}
            </button>
            {canEdit && (
              <button
                type="submit"
                className="bg-[var(--accent)] text-white text-[13px] font-semibold rounded-[10px] px-4 py-2 hover:opacity-90 transition-opacity"
              >
                {mode === 'edit' ? t('common.save') : t('common.create')}
              </button>
            )}
          </div>
        </div>
      </form>
    </div>
  )
}
