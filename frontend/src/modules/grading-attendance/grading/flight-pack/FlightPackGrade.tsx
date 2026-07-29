import { useRef, useState } from 'react'
import { HiOutlineCheckCircle, HiOutlineXMark, HiOutlineTrash, HiOutlineArrowUpOnSquare } from 'react-icons/hi2'
import { useI18n } from '../../../../infra/locales/I18nContext'
import { useToast } from '../../../../infra/shared/store/useToastStore'
import { saveFlightPackGrading, saveAllFlightPackGrading } from '../api'

interface GradingTask {
  task_id: number
  pack_id: number
  task_no: string
  task_desc: string
  satisfied: boolean | null
  score: number | null
  note: string | null
}

interface Props {
  packId: number
  packName: string
  tasks: GradingTask[]
  onClose: () => void
  onSave: () => void
  saving: boolean
  courseId: number
  studentId: number
}

export default function FlightPackGrade({ packId, packName, tasks, onClose, onSave, saving: propsSaving, courseId, studentId }: Props) {
  const { t } = useI18n()
  const showToast = useToast()

  // Mutable ref holding the real source of truth
  const stateRef = useRef({
    taskStates: tasks.map(t => ({ ...t })),
  })
  const [, setTick] = useState(0)
  const dispatch = (action: 'SATISFY' | 'UNSATISFY' | 'UNGRADE' | 'SCORE_CHANGE', taskId: number, score?: number | null) => {
    const ts = stateRef.current.taskStates
    const task = ts.find(t => t.task_id === taskId)
    if (!task) return
    switch (action) {
      case 'SATISFY':
        Object.assign(task, { satisfied: true, score: task.score ?? null })
        break
      case 'UNSATISFY':
        Object.assign(task, { satisfied: false, score: null })
        break
      case 'UNGRADE':
        Object.assign(task, { satisfied: null, score: null })
        break
      case 'SCORE_CHANGE':
        task.score = score ?? null
        break
    }
    setTick(t => t + 1)
  }

  const saveAll = async () => {
    if (propsSaving) return
    const grades = stateRef.current.taskStates
      .filter(t => t.satisfied !== null)
      .map(t => ({
        student_id: studentId,
        course_instance_id: courseId,
        pack_id: packId,
        task_id: t.task_id,
        satisfied: t.satisfied,
        score: t.score,
        note: t.note || null,
      }))
    if (grades.length > 0) {
      try {
        await saveAllFlightPackGrading(grades as any)
        showToast.success({ title: t('grading.gradeSaved') })
        onSave()
      } catch {
        showToast.error({ title: t('grading.saveError') })
      }
    }
  }

  const totalScore = stateRef.current.taskStates
    .filter(t => t.satisfied === true)
    .reduce((sum, t) => sum + (t.score ?? 0), 0)

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-surface rounded-2xl border border-bd shadow-elevated w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 px-6 pt-5 pb-4 border-b border-bd">
          <div className="flex-1">
            <p className="text-[15px] font-bold text-primary leading-snug">{t('grading.grade')}</p>
            <p className="text-[12px] text-muted mt-0.5">{packName}</p>
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

        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="card border-b-0 rounded-none">
            {stateRef.current.taskStates.map((task, index) => (
              <div key={task.task_id} className="flex flex-col gap-2 px-5 py-4 border-b border-bd hover:bg-surface-2 transition-colors">
                <div className="flex items-center gap-3">
                  <span className="text-[11px] font-bold text-muted w-5">#{index + 1}</span>
                  <span className="text-[13px] font-semibold flex-1 text-primary">
                    {task.task_no} - {task.task_desc}
                  </span>
                  {task.satisfied === true && (
                    <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ backgroundColor: 'var(--success-light)', color: 'var(--success)' }}>
                      {t('grading.satisfy')}
                    </span>
                  )}
                  {task.satisfied === false && (
                    <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ backgroundColor: 'var(--danger-light)', color: 'var(--danger)' }}>
                      {t('grading.unsatisfy')}
                    </span>
                  )}
                </div>

                {task.satisfied === null && (
                  <div className="flex items-center gap-2 pl-8">
                    <button
                      onClick={() => dispatch('SATISFY', task.task_id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[7px] text-[12px] font-semibold text-white border-none cursor-pointer font-sans"
                      style={{ backgroundColor: 'var(--success)' }}
                    >
                      <HiOutlineCheckCircle className="text-[14px]" />
                      {t('grading.satisfy')}
                    </button>
                    <button
                      onClick={() => dispatch('UNSATISFY', task.task_id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[7px] text-[12px] font-semibold text-white border-none cursor-pointer font-sans"
                      style={{ backgroundColor: 'var(--danger)' }}
                    >
                      <HiOutlineXMark className="text-[14px]" />
                      {t('grading.unsatisfy')}
                    </button>
                  </div>
                )}

                {task.satisfied === true && (
                  <div className="flex items-center gap-3 pl-8">
                    <label className="text-[12px] font-semibold text-secondary shrink-0">{t('grading.score')}:</label>
                    <input
                      type="number"
                      min={0}
                      value={task.score ?? ''}
                      onChange={(e) => {
                        const num = e.target.value === '' ? null : Math.max(0, parseInt(e.target.value, 10))
                        dispatch('SCORE_CHANGE', task.task_id, num)
                      }}
                      className="w-[70px] h-[34px] px-2.5 rounded-[7px] bg-[var(--surface)] text-primary text-sm font-medium outline-none transition-[border-color] duration-150 ease-in-out border"
                      style={{ borderColor: 'var(--border)' }}
                      onFocus={e => { e.target.style.borderColor = 'var(--accent)' }}
                      onBlur={e => { e.target.style.borderColor = 'var(--border)' }}
                    />
                    <button
                      onClick={() => dispatch('UNGRADE', task.task_id)}
                      type="button"
                      aria-label="Ungrade"
                      className="shrink-0 h-7 w-7 inline-flex items-center justify-center rounded-[7px] text-muted hover:text-danger hover:bg-surface-2 transition-colors cursor-pointer border-none bg-transparent"
                      title={t('grading.ungrade')}
                    >
                      <HiOutlineTrash className="text-[14px]" />
                    </button>
                  </div>
                )}

                {task.satisfied === false && (
                  <div className="flex items-center gap-3 pl-8">
                    <span className="text-[11px] font-semibold text-muted">{t('grading.unsatisfyNote')}</span>
                    <button
                      onClick={() => dispatch('UNGRADE', task.task_id)}
                      type="button"
                      aria-label="Ungrade"
                      className="shrink-0 h-7 w-7 inline-flex items-center justify-center rounded-[7px] text-muted hover:text-danger hover:bg-surface-2 transition-colors cursor-pointer border-none bg-transparent"
                      title={t('grading.ungrade')}
                    >
                      <HiOutlineTrash className="text-[14px]" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-between items-center px-6 py-4 bg-surface-2 border-t border-bd">
          <span className="text-[12px] font-semibold text-muted">{t('grading.totalScore')}: {totalScore}</span>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-[9px] text-sm font-semibold text-secondary bg-surface border border-bd hover:bg-surface-2 transition-colors cursor-pointer font-sans">
              {t('grading.cancel')}
            </button>
            <button
              onClick={saveAll}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-[9px] text-sm font-semibold text-white bg-accent border-none cursor-pointer hover:opacity-90 transition-opacity font-sans"
              disabled={propsSaving}
            >
              {propsSaving ? <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <HiOutlineArrowUpOnSquare className="text-[14px]" />}
              {propsSaving ? t('grading.saving') : t('grading.saveAllGrading')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
