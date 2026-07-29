import {useEffect, useMemo, useState} from 'react'
import {
  HiOutlineChevronDown,
  HiOutlineChevronRight,
  HiOutlineTrash,
  HiOutlinePlus,
  HiOutlinePaperAirplane,
  HiOutlinePrinter,
} from 'react-icons/hi2'
import { useI18n } from '../../../infra/locales/I18nContext'
import useCurrenciesCertStore, { selectFlightPackages, selectTaskMaster, selectCourseTitle } from './store'
import TaskComboBox from './TaskComboBox'
import SortieReportPrintModal from './SortieReportPrintModal'
import { createFlightTaskMaster } from './currencies-cert-api'
import useFullBleedStore from "../../../infra/shared/store/useFullBleedStore.ts";

export default function FlightPackageTab({ isComplete }: { isComplete: boolean }) {
  const { t } = useI18n()
  const packages = useCurrenciesCertStore(selectFlightPackages)
  const addFlightPackage = useCurrenciesCertStore((s) => s.addFlightPackage)

  // Collapsed package indices (default expanded).
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set())
  const toggleCollapsed = (index: number) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })

  const readOnly = isComplete

  // Fill the content area edge-to-edge (drops Layout's standard frame padding).
  const setFullBleed = useFullBleedStore((s) => s.setFullBleed)
  useEffect(() => {
    setFullBleed(true)
    return () => setFullBleed(false)
  }, [setFullBleed])

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-[var(--border)] px-6 pt-4">
        <div>
          <h2 className="text-[18px] font-bold text-primary">
            {t('courseManagement.currenciesCert.flightPackage.title')}
          </h2>
          <p className="text-[12px] text-muted mt-0.5">
            {t('courseManagement.currenciesCert.flightPackage.description')}
          </p>
        </div>
        {!readOnly && (
          <button
            type="button"
            onClick={addFlightPackage}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-[var(--accent)] border border-[var(--accent)] text-white text-[12px] font-semibold cursor-pointer transition-opacity hover:opacity-85"
            style={{ boxShadow: '0 1px 2px rgba(6,85,92,0.25)' }}
          >
            <HiOutlinePlus className="w-4 h-4 flex-none" />
            {t('courseManagement.currenciesCert.flightPackage.addPackage')}
          </button>
        )}
      </div>

      {/* Package list */}
      <div className="flex-1 min-h-0 overflow-y-auto thin-scrollbar-light px-6 py-4 flex flex-col gap-3">
        {packages.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 text-muted py-16">
            <HiOutlinePaperAirplane className="text-[24px]" />
            <p className="text-[13px]">{t('courseManagement.currenciesCert.flightPackage.empty')}</p>
          </div>
        ) : (
          packages.map((pkg, index) => (
            <PackageBlock
              key={index}
              index={index}
              name={pkg.name}
              taskCount={pkg.tasks.length}
              collapsed={collapsed.has(index)}
              onToggleCollapsed={() => toggleCollapsed(index)}
              readOnly={readOnly}
            />
          ))
        )}
      </div>
    </div>
  )
}

function PackageBlock({
  index,
  name,
  taskCount,
  collapsed,
  onToggleCollapsed,
  readOnly,
}: {
  index: number
  name: string
  taskCount: number
  collapsed: boolean
  onToggleCollapsed: () => void
  readOnly: boolean
}) {
  const { t } = useI18n()
  const updateName = useCurrenciesCertStore((s) => s.updateFlightPackageName)
  const removePackage = useCurrenciesCertStore((s) => s.removeFlightPackage)
  const courseTitle = useCurrenciesCertStore(selectCourseTitle)
  const tasks = useCurrenciesCertStore((s) => s.flightPackages[index]?.tasks) ?? []
  const [printing, setPrinting] = useState(false)

  return (
    <div className="rounded-[10px] border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
      {/* Package header */}
      <div className="flex items-center gap-2 px-3 py-2.5 bg-[var(--surface-2)] border-b border-[var(--border)]">
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="shrink-0 p-1 rounded-md text-muted hover:text-primary hover:bg-[var(--surface)] border-none bg-transparent cursor-pointer"
          title={collapsed ? t('courseManagement.currenciesCert.flightPackage.expand') : t('courseManagement.currenciesCert.flightPackage.collapse')}
        >
          {collapsed ? <HiOutlineChevronRight className="w-4 h-4" /> : <HiOutlineChevronDown className="w-4 h-4" />}
        </button>
        <input
          type="text"
          value={name}
          onChange={(e) => updateName(index, e.target.value)}
          placeholder={t('courseManagement.currenciesCert.flightPackage.packageNamePlaceholder')}
          disabled={readOnly}
          className="flex-1 min-w-0 px-2.5 py-1.5 rounded-[8px] border border-[var(--border)] text-[13px] font-semibold text-primary placeholder:text-muted placeholder:font-normal focus:outline-none focus:border-accent disabled:bg-[var(--surface-2)] disabled:cursor-not-allowed"
        />
        <span className="shrink-0 text-[11px] text-muted px-1.5">
          {taskCount} {t('courseManagement.currenciesCert.flightPackage.tasks')}
        </span>
        <button
          type="button"
          onClick={() => setPrinting(true)}
          className="shrink-0 p-1.5 rounded-md text-muted hover:text-accent hover:bg-[var(--surface)] border-none bg-transparent cursor-pointer"
          title={t('courseManagement.currenciesCert.flightPackage.print')}
        >
          <HiOutlinePrinter className="w-4 h-4" />
        </button>
        {!readOnly && (
          <button
            type="button"
            onClick={() => removePackage(index)}
            className="shrink-0 p-1.5 rounded-md text-muted hover:text-[#DC2626] hover:bg-[#fef3f2] border-none bg-transparent cursor-pointer"
            title={t('courseManagement.currenciesCert.flightPackage.removePackage')}
          >
            <HiOutlineTrash className="w-4 h-4" />
          </button>
        )}
      </div>

      {printing && (
        <SortieReportPrintModal
          courseTitle={courseTitle}
          packageName={name}
          tasks={tasks}
          onClose={() => setPrinting(false)}
        />
      )}

      {/* Package body (tasks) */}
      {!collapsed && (
        <div className="px-3 py-3 flex flex-col gap-3">
          {!readOnly && <TaskPicker packageIndex={index} />}
          <TaskList packageIndex={index} readOnly={readOnly} />
        </div>
      )}
    </div>
  )
}

function TaskPicker({ packageIndex }: { packageIndex: number }) {
  const { t } = useI18n()
  const options = useCurrenciesCertStore(selectTaskMaster)
  const addTask = useCurrenciesCertStore((s) => s.addFlightTask)
  const addTaskMasterOption = useCurrenciesCertStore((s) => s.addTaskMasterOption)
  // Select the stable tasks reference; derive ids in a memo so the selector
  // never returns a fresh array (which would loop useSyncExternalStore).
  const tasks = useCurrenciesCertStore((s) => s.flightPackages[packageIndex]?.tasks)
  const existingIds = useMemo(() => (tasks ?? []).map((tk) => tk.task_master_id), [tasks])
  const [pendingId, setPendingId] = useState(0)

  const alreadyAdded = pendingId !== 0 && existingIds.includes(pendingId)

  const handleCreate = async (taskNo: string, taskDescription: string) => {
    const created = await createFlightTaskMaster(taskNo, taskDescription)
    addTaskMasterOption(created)
    return created
  }

  const handleAdd = () => {
    if (pendingId === 0 || alreadyAdded) return
    addTask(packageIndex, pendingId)
    setPendingId(0)
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-end gap-2">
        <div className="flex-1 min-w-0">
          <TaskComboBox
            value={pendingId}
            options={options}
            onChange={setPendingId}
            onCreate={handleCreate}
          />
        </div>
        <button
          type="button"
          onClick={handleAdd}
          disabled={pendingId === 0 || alreadyAdded}
          className="h-9 shrink-0 inline-flex items-center gap-1.5 px-3 rounded-[8px] bg-accent-light text-accent text-[12px] font-semibold border-none cursor-pointer hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
        >
          <HiOutlinePlus className="text-[13px]" />
          {t('courseManagement.currenciesCert.flightPackage.addTask')}
        </button>
      </div>
      {alreadyAdded && (
        <p className="text-[11px] text-muted">
          {t('courseManagement.currenciesCert.flightPackage.taskAlreadyAdded')}
        </p>
      )}
    </div>
  )
}

function TaskList({ packageIndex, readOnly }: { packageIndex: number; readOnly: boolean }) {
  const { t } = useI18n()
  const tasksRef = useCurrenciesCertStore((s) => s.flightPackages[packageIndex]?.tasks)
  const removeTask = useCurrenciesCertStore((s) => s.removeFlightTask)
  const tasks = tasksRef ?? []

  if (tasks.length === 0) {
    return (
      <p className="text-[12px] text-muted py-2 text-center">
        {t('courseManagement.currenciesCert.flightPackage.noTasks')}
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-1.5">
      {/* Column headers */}
      <div className="flex items-center gap-2 px-2">
        <span className="w-7 shrink-0" />
        <span className="w-40 shrink-0 text-[11px] font-bold text-muted uppercase tracking-[0.05em]">
          {t('courseManagement.currenciesCert.flightPackage.taskNo')}
        </span>
        <span className="flex-1 text-[11px] font-bold text-muted uppercase tracking-[0.05em]">
          {t('courseManagement.currenciesCert.flightPackage.taskDescription')}
        </span>
        {!readOnly && <span className="w-7 shrink-0" />}
      </div>

      <ul className="flex flex-col gap-1.5 list-none p-0 m-0">
        {tasks.map((task, taskIndex) => (
          <li
            key={`${task.task_master_id}-${taskIndex}`}
            className="flex items-center gap-2 pl-2 pr-1 py-1.5 rounded-[8px] bg-[var(--accent-light)] border border-[var(--border)]"
          >
            <span className="w-5 h-5 rounded-full bg-[var(--accent)] text-white text-[10.5px] font-semibold flex items-center justify-center shrink-0">
              {taskIndex + 1}
            </span>
            <span className="w-40 shrink-0 text-[13px] font-semibold text-primary truncate">
              {task.task_no || '—'}
            </span>
            <span className="flex-1 min-w-0 text-[13px] text-primary truncate">
              {task.task_description || '—'}
            </span>
            {!readOnly && (
              <button
                type="button"
                onClick={() => removeTask(packageIndex, taskIndex)}
                className="shrink-0 w-7 h-7 flex items-center justify-center rounded-md text-muted hover:text-[#DC2626] hover:bg-[#fef3f2] border-none bg-transparent cursor-pointer"
                title={t('courseManagement.currenciesCert.flightPackage.removeTask')}
              >
                <HiOutlineTrash className="w-4 h-4" />
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
