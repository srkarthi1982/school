import { useEffect, useState } from 'react'
import { HiOutlineXMark, HiOutlinePrinter } from 'react-icons/hi2'
import { useI18n } from '../../../../infra/locales/I18nContext'
import { useToast } from '../../../../infra/shared/store/useToastStore'
import { buildPrintDocument } from './printDocument'
import { PersonnelStudent } from '../store'

interface GradingFlightTask {
  task_id: number
  pack_id: number
  task_no: string
  task_desc: string
  satisfied: boolean | null
  score: number | null
  note: string | null
}

interface FillData {
  pack_id: number
  student_name: string
  rank: string
  date: string
  sortie_number: string
  sortie_detail: string
  hour_day: string
  hour_night: string
  hour_nvg: string
  hour_total: string
  inst_simulated: string
  inst_actual: string
  inst_approaches: string
  inst_ils: string
  inst_vor: string
  grade_sortie: string
  grade_illum: string
  grade_weather: string
}

export interface Fields {
  studentName: string
  rank: string
  username: string
  date: string
  sortieNumber: string
  sortieDetail: string
  day: string
  night: string
  nvg: string
  totalFlown: string
  simulated: string
  actual: string
  approachesFlown: string
  ilsNo: string
  vorNo: string
  sortieGrade: string
  illumData: string
  weather: string
}

interface Props {
  courseTitle: string
  packageName: string
  tasks: GradingFlightTask[]
  fillData: FillData | null
  onClose: () => void
  onSave: (data: Fields) => void
  onSavePdf?: () => void
  studentProfile: PersonnelStudent | null
}

export default function FlightPackFillPrint({ courseTitle, packageName, tasks, fillData, onClose, onSave, onSavePdf, studentProfile }: Props) {
  const { t } = useI18n()
  const [fields, setFields] = useState<Fields>(() => {
    const today = new Date().toISOString().split('T')[0]
    const defaultFields: Fields = {
      studentName: '',
      rank: 'CIVILIAN',
      username: '',
      date: today,
      sortieNumber: '',
      sortieDetail: '',
      day: '',
      night: '',
      nvg: '',
      totalFlown: '',
      simulated: '',
      actual: '',
      approachesFlown: '',
      ilsNo: '',
      vorNo: '',
      sortieGrade: '',
      illumData: '',
      weather: '',
    }
    if (fillData) {
      return {
        ...defaultFields,
        username: '',
        studentName: fillData.student_name,
        rank: fillData.rank,
        date: fillData.date || today,
        sortieNumber: fillData.sortie_number,
        sortieDetail: fillData.sortie_detail || '',
        day: fillData.hour_day,
        night: fillData.hour_night,
        nvg: fillData.hour_nvg,
        totalFlown: fillData.hour_total,
        simulated: fillData.inst_simulated,
        actual: fillData.inst_actual,
        approachesFlown: fillData.inst_approaches,
        ilsNo: fillData.inst_ils,
        vorNo: fillData.inst_vor,
        sortieGrade: fillData.grade_sortie,
        illumData: fillData.grade_illum,
        weather: fillData.grade_weather,
      }
    }
    if (studentProfile && studentProfile.full_name) {
      return {
        ...defaultFields,
        studentName: studentProfile.full_name,
        rank: studentProfile.rank || 'CIVILIAN',
        username: studentProfile.username || '',
      }
    }
    return defaultFields
  })
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const set = (key: keyof Fields) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setFields((prev) => ({ ...prev, [key]: e.target.value }))

  const inputCls =
    'px-2.5 py-1.5 rounded-[7px] bg-surface text-primary text-[13px] outline-none border border-[var(--border)] focus:border-accent'

  const field = (label: string, key: keyof Fields, placeholder = '') => (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] font-bold uppercase tracking-[0.05em] text-muted">{label}</label>
      <input
        type={key === 'date' ? 'date' : (key === 'username' ? 'text' : key)}
        className={inputCls}
        value={fields[key]}
        placeholder={placeholder}
        onChange={set(key)}
      />
    </div>
  )

  const handlePrint = () => {
    const html = buildPrintDocument(fields as any, courseTitle, tasks.map(t => ({
      task_master_id: t.task_id,
      task_no: t.task_no,
      task_description: t.task_desc,
    })))
    const win = window.open('', '_blank', 'width=900,height=1000')
    if (!win) return
    win.document.open()
    win.document.write(html)
    win.document.close()
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-surface rounded-2xl border border-bd shadow-elevated w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 px-6 pt-5 pb-4 border-b border-bd">
          <div className="flex-1">
            <p className="text-[15px] font-bold text-primary leading-snug">{t('grading.fillFlightPack')}</p>
            <p className="text-[12px] text-muted mt-0.5">{courseTitle || packageName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 -mt-1 -mr-1 h-7 w-7 inline-flex items-center justify-center rounded-[7px] text-muted hover:text-primary hover:bg-surface-2 transition-colors cursor-pointer border-none bg-transparent"
          >
            <HiOutlineXMark className="text-[16px]" />
          </button>
        </div>

        <div className="px-6 py-4 overflow-y-auto flex flex-col gap-5">
          <Section title={t('grading.personalData')}>
            <div className="grid grid-cols-2 gap-3">
              {field(t('grading.name'), 'studentName')}
              {field(t('grading.rank'), 'rank')}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold uppercase tracking-[0.05em] text-muted">{t('grading.course')}</label>
                <div className="px-2.5 py-1.5 rounded-[7px] bg-surface-2 text-primary text-[13px] border border-[var(--border)]">
                  {courseTitle || '—'}
                </div>
              </div>
            </div>
          </Section>

          <Section title={t('grading.sortieInformation')}>
            <div className="grid grid-cols-2 gap-3">
              {field(t('grading.date'), 'date')}
              {field(t('grading.sortieNumber'), 'sortieNumber')}
              <div className="col-span-2">{field(t('grading.sortieDetail'), 'sortieDetail')}</div>
            </div>
          </Section>

          <Section title={t('grading.hrsFlown')}>
            <div className="grid grid-cols-4 gap-3">
              {field(t('grading.day'), 'day')}
              {field(t('grading.night'), 'night')}
              {field(t('grading.nvg'), 'nvg')}
              {field(t('grading.totalFlown'), 'totalFlown')}
            </div>
          </Section>

          <Section title={t('grading.instrumentFlying')}>
            <div className="grid grid-cols-3 gap-3">
              {field(t('grading.simulated'), 'simulated')}
              {field(t('grading.actual'), 'actual')}
              {field(t('grading.approachesFlown'), 'approachesFlown')}
              {field(t('grading.ilsNo'), 'ilsNo')}
              {field(t('grading.vorNo'), 'vorNo')}
            </div>
          </Section>

          <Section title={t('grading.gradeConditions')}>
            <div className="grid grid-cols-3 gap-3">
              {field(t('grading.sortieGrade'), 'sortieGrade')}
              {field(t('grading.illumData'), 'illumData')}
              {field(t('grading.weather'), 'weather')}
            </div>
          </Section>

          <Section title={t('grading.tasksList')}>
            {tasks.length === 0 ? (
              <p className="text-[12px] text-muted">{t('grading.noTasks')}</p>
            ) : (
              <ul className="flex flex-col gap-1 list-none p-0 m-0">
                {tasks.map((task, i) => (
                  <li key={task.task_id} className="flex gap-2 text-[12px] text-primary">
                    <span className="font-semibold w-28 shrink-0">{task.task_no || <span className="text-muted">—</span>}</span>
                    <span className="flex-1">{task.task_desc || <span className="text-muted">—</span>}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 bg-surface-2 border-t border-bd">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-[9px] text-sm font-semibold text-secondary bg-surface border border-bd hover:bg-surface-2 transition-colors cursor-pointer font-sans"
          >
            {t('grading.cancel')}
          </button>
          <button
            type="button"
            onClick={() => {
              setSaveState('saving')
              onSave(fields)
              setSaveState('saved')
              setTimeout(() => setSaveState('idle'), 2000)
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-[9px] text-sm font-semibold text-white bg-accent border-none cursor-pointer hover:opacity-90 transition-opacity font-sans"
          >
            {saveState === 'saving' ? (
              <span className="loading-spinner"></span>
            ) : null}
            {saveState === 'saved' ? '✓' : null}
            {t('grading.save')}
          </button>
          <button
            type="button"
            onClick={() => {
              handlePrint()
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-[9px] text-sm font-semibold text-white bg-accent border-none cursor-pointer hover:opacity-90 transition-opacity font-sans"
          >
            <HiOutlinePrinter className="text-[15px]" />
            {t('grading.printPdf')}
          </button>
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-[12px] font-bold uppercase tracking-[0.06em] text-accent">{title}</h3>
      {children}
    </div>
  )
}
