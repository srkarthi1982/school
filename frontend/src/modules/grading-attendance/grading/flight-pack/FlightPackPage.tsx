import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'
import { HiOutlineArrowLeft } from 'react-icons/hi2'
import { useI18n } from '../../../../infra/locales/I18nContext'
import { useToast } from '../../../../infra/shared/store/useToastStore'
import { fetchGradingFlightPackages, saveFlightPackFill } from '../api'
import useStore from '../store'
import FlightPackFillPrint from './FlightPackFillPrint'
import FlightPackGrade from './FlightPackGrade'
import type { Fields as FillFields } from './FlightPackFillPrint'

interface GradingFlightTask {
  task_id: number
  pack_id: number
  task_no: string
  task_desc: string
  satisfied: boolean | null
  score: number | null
  note: string | null
}

interface GradingPkPack {
  pack_id: number
  name: string
  tasks: GradingFlightTask[]
}

interface PackData extends GradingPkPack {
  completedTasks: number
  satisfiedCount: number
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

export default function FlightPackPage() {
  const { courseId } = useParams<{ courseId: string }>()
  const { t } = useI18n()
  const showToast = useToast()
  const navigate = useNavigate()

  const { selectedStudent, selectedCourse, setActiveTab, loadStudents, getCourses } = useStore(useShallow(s => ({
    selectedStudent: s.selectedStudent,
    selectedCourse: s.selectedCourse,
    setActiveTab: s.setActiveTab,
    loadStudents: s.loadStudents,
    getCourses: s.getCourses,
  })))

  const [packs, setPacks] = useState<PackData[]>([])
  const [fills, setFills] = useState<FillData[]>([])
  const [loading, setLoading] = useState(true)
  const [saveLoading, setSaveLoading] = useState(false)
  const [panel, setPanel] = useState<{ type: 'fill' | 'grade' | null; packIndex: number }>({ type: null, packIndex: -1 })

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      if (courseId) { await loadStudents(Number(courseId)) }
      setActiveTab('flight-pack')

      try {
        const studentId = selectedStudent?.id
        const data = await fetchGradingFlightPackages(Number(courseId), studentId)
        const packData: PackData[] = data.packages.map(pkg => {
          const completedTasks = pkg.tasks.filter(t => t.satisfied === true).length
          return {
            pack_id: pkg.pack_id,
            name: pkg.name,
            tasks: pkg.tasks,
            completedTasks,
            satisfiedCount: completedTasks,
          }
        })
        setPacks(packData)
        setFills(data.fills || [])
      } catch { /* ignore, will show empty */ }

      setLoading(false)
    })()
  }, [courseId, selectedStudent?.id])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPanel({ type: null, packIndex: -1 })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const closePanel = () => setPanel({ type: null, packIndex: -1 })
  const openFill = (packIndex: number) => setPanel({ type: 'fill', packIndex })
  const openGrade = (packIndex: number) => setPanel({ type: 'grade', packIndex })

  const handleBack = () => navigate('/grading-attendance/grading/course-pick/' + courseId)

  const handleSaveGrade = useCallback(async () => {
    setSaveLoading(true)
    try {
      showToast.success({ title: t('grading.gradeSaved') })
      const studentId = selectedStudent?.id
      const data = await fetchGradingFlightPackages(Number(courseId), studentId)
      setPacks(data.packages.map(pkg => ({
        pack_id: pkg.pack_id,
        name: pkg.name,
        tasks: pkg.tasks,
        completedTasks: pkg.tasks.filter(t => t.satisfied === true).length,
        satisfiedCount: 0,
      })))
      setFills(data.fills || [])
      closePanel()
    } catch {
      showToast.error({ title: t('grading.saveError') })
    } finally {
      setSaveLoading(false)
    }
  }, [packs, panel.packIndex, courseId, selectedStudent?.id, showToast, t])

  const handleSaveFill = useCallback(async (fillData: FillFields) => {
    setSaveLoading(true)
    try {
      const pack = packs[panel.packIndex]
      if (!pack) return
      const existingFill = fills.find(f => f.pack_id === pack.pack_id)
      await saveFlightPackFill({
        course_instance_id: Number(courseId!),
        student_id: selectedStudent?.id || 0,
        pack_id: pack.pack_id,
        student_name: fillData.studentName || existingFill?.student_name || selectedStudent?.full_name || '',
        rank: fillData.rank || existingFill?.rank || 'CIVILIAN',
        date: fillData.date || new Date().toISOString().split('T')[0],
        sortie_number: fillData.sortieNumber || '',
        sortie_detail: fillData.sortieDetail || '',
        hour_day: fillData.day || '',
        hour_night: fillData.night || '',
        hour_nvg: fillData.nvg || '',
        hour_total: fillData.totalFlown || '',
        inst_simulated: fillData.simulated || '',
        inst_actual: fillData.actual || '',
        inst_approaches: fillData.approachesFlown || '',
        inst_ils: fillData.ilsNo || '',
        inst_vor: fillData.vorNo || '',
        grade_sortie: fillData.sortieGrade || '',
        grade_illum: fillData.illumData || '',
        grade_weather: fillData.weather || '',
      })
      showToast.success({ title: t('grading.gradeSaved') })
      const studentId = selectedStudent?.id
      const fetchData = await fetchGradingFlightPackages(Number(courseId), studentId)
      setPacks(fetchData.packages.map(pkg => ({
        pack_id: pkg.pack_id,
        name: pkg.name,
        tasks: pkg.tasks,
        completedTasks: pkg.tasks.filter(t => t.satisfied === true).length,
        satisfiedCount: 0,
      })))
      setFills(fetchData.fills || [])
      closePanel()
    } catch {
      showToast.error({ title: t('grading.saveError') })
    } finally {
      setSaveLoading(false)
    }
  }, [packs, fills, panel.packIndex, courseId, selectedStudent, showToast, t])

  const openBtnCls = 'px-3 py-1.5 rounded-[7px] text-xs font-semibold text-secondary bg-surface-2 border border-bd hover:bg-surface transition-colors cursor-pointer font-sans'
  const pack = panel.type && panel.packIndex >= 0 && panel.packIndex < packs.length ? packs[panel.packIndex] : null

  if (loading) return <p className="text-muted">{t('grading.loading')}</p>

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between mb-2">
        <button onClick={handleBack} className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-muted hover:text-primary bg-transparent border-none cursor-pointer p-0">
          <HiOutlineArrowLeft className="text-[14px]" /> {t('grading.backToStudents')}
        </button>
      </div>

      {selectedStudent && selectedCourse && (
        <div className="flex items-center gap-3 pb-4 border-b border-bd">
          <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center shrink-0">
            <span className="text-xs font-bold text-white">{selectedStudent.full_name.split(' ').map(n => n[0]).join('').toUpperCase()}</span>
          </div>
          <div>
            <p className="text-[15px] font-bold text-primary">{selectedStudent.full_name}</p>
            <div className="flex items-center gap-2 mt-1">
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-accent-light text-accent">
                {t('grading.flightPack')}
              </span>
              <span className="text-[11px] text-muted">{selectedCourse.title}</span>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {packs.map((pack, index) => (
          <div key={pack.pack_id} className="card px-5 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <p className="text-[14px] font-bold text-primary">{pack.name}</p>
                <p className="text-[12px] text-secondary">
                  {pack.tasks.length} {pack.tasks.length === 1 ? 'task' : 'tasks'}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => openFill(index)} className={openBtnCls}>
                  {t('grading.preFill')}
                </button>
                <button onClick={() => openGrade(index)} className="inline-flex items-center px-3 py-1.5 rounded-[7px] text-xs font-semibold bg-accent text-white hover:opacity-90 transition-opacity border-none cursor-pointer font-sans">
                  {t('grading.grade')}
                </button>
              </div>
            </div>
            <div className="flex items-center gap-3 pt-3" hidden>
              <span className="text-[11px] text-muted font-medium">{pack.completedTasks}/{pack.tasks.length}</span>
              <div className="flex-1 h-1 bg-surface-2 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-[width] duration-300"
                  style={{
                    width: `${pack.tasks.length > 0 ? (pack.completedTasks / pack.tasks.length) * 100 : 0}%`,
                    background: pack.completedTasks === pack.tasks.length && pack.tasks.length > 0
                      ? 'var(--success)'
                      : 'var(--accent)',
                  }}
                />
              </div>
              <span className="text-[11px] text-muted font-medium">
                {pack.tasks.length > 0 ? Math.round((pack.completedTasks / pack.tasks.length) * 100) : 0}%
              </span>
            </div>
          </div>
        ))}

        {packs.length === 0 && (
          <div className="card px-6 py-10 flex flex-col items-center text-center gap-3">
            <p className="text-base font-semibold text-muted">No flight packs found.</p>
          </div>
        )}
      </div>

      {panel.type === 'fill' && pack && selectedCourse && (
        <FlightPackFillPrint
          courseTitle={selectedCourse.title}
          packageName={pack.name}
          tasks={pack.tasks || []}
          fillData={fills.find(f => f.pack_id === pack.pack_id) || null}
          onClose={closePanel}
          onSave={handleSaveFill}
          onSavePdf={() => window.print()}
          studentProfile={selectedStudent}
        />
      )}

      {panel.type === 'grade' && pack && selectedCourse && (
        <FlightPackGrade
          packId={pack.pack_id}
          packName={pack.name}
          tasks={pack.tasks}
          onClose={closePanel}
          onSave={handleSaveGrade}
          saving={saveLoading}
          courseId={Number(courseId!)}
          studentId={selectedStudent?.id || 0}
        />
      )}
    </div>
  )
}
