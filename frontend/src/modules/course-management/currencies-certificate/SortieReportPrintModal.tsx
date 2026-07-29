import { useEffect, useState } from 'react'
import { HiOutlineXMark, HiOutlinePrinter } from 'react-icons/hi2'
import type { FlightPackageTask } from './currencies-cert-api'

// Fields collected from the operator before the Sortie Report Form is printed.
// They map 1:1 onto the printed NAG IATF FORM 7 & 8 layout.
interface SortieFields {
  name: string
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

const EMPTY_FIELDS: SortieFields = {
  name: '',
  rank: '',
  username: '',
  date: '',
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

interface Props {
  courseTitle: string
  packageName: string
  tasks: FlightPackageTask[]
  onClose: () => void
}

// Minimum number of grade-slip rows to render so the printed form keeps its
// shape even for short packages.
const MIN_TASK_ROWS = 8

export default function SortieReportPrintModal({ courseTitle, packageName, tasks, onClose }: Props) {
  const [fields, setFields] = useState<SortieFields>({
    ...EMPTY_FIELDS,
    // Each package maps to one sortie; seed the number with the package name.
    sortieNumber: packageName,
  })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const set = (key: keyof SortieFields) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setFields((prev) => ({ ...prev, [key]: e.target.value }))

  const handlePrint = () => {
    const html = buildPrintDocument(fields, courseTitle, tasks)
    const win = window.open('', '_blank', 'width=900,height=1000')
    if (!win) return
    win.document.open()
    win.document.write(html)
    win.document.close()
  }

  const inputCls =
    'px-2.5 py-1.5 rounded-[7px] bg-surface text-primary text-[13px] outline-none border border-[var(--border)] focus:border-accent'

  const field = (label: string, key: keyof SortieFields, placeholder = '') => (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] font-bold uppercase tracking-[0.05em] text-muted">{label}</label>
      <input
        type={key === 'date' ? 'date' : 'text'}
        className={inputCls}
        value={fields[key]}
        placeholder={placeholder}
        onChange={set(key)}
      />
    </div>
  )

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
            <p className="text-[15px] font-bold text-primary leading-snug">Print Sortie Report</p>
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
          <Section title="Personal Data">
            <div className="grid grid-cols-2 gap-3">
              {field('Name', 'name')}
              {field('Rank', 'rank')}
              {field('Username', 'username')}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold uppercase tracking-[0.05em] text-muted">Course</label>
                <div className="px-2.5 py-1.5 rounded-[7px] bg-surface-2 text-primary text-[13px] border border-[var(--border)]">
                  {courseTitle || '—'}
                </div>
              </div>
            </div>
          </Section>

          <Section title="Sortie Information">
            <div className="grid grid-cols-2 gap-3">
              {field('Date', 'date')}
              {field('Sortie Number', 'sortieNumber')}
              <div className="col-span-2">{field('Sortie Detail', 'sortieDetail')}</div>
            </div>
          </Section>

          <Section title="Hrs Flown">
            <div className="grid grid-cols-4 gap-3">
              {field('Day', 'day')}
              {field('Night', 'night')}
              {field('NVG', 'nvg')}
              {field('Total Flown', 'totalFlown')}
            </div>
          </Section>

          <Section title="Instrument Flying Details">
            <div className="grid grid-cols-3 gap-3">
              {field('Simulated', 'simulated')}
              {field('Actual', 'actual')}
              {field('Approaches Flown', 'approachesFlown')}
              {field('ILS No', 'ilsNo')}
              {field('VOR No', 'vorNo')}
            </div>
          </Section>

          <Section title="Grade & Conditions">
            <div className="grid grid-cols-3 gap-3">
              {field('Sortie Grade (%)', 'sortieGrade')}
              {field('Illum Data (%)', 'illumData')}
              {field('Weather', 'weather')}
            </div>
          </Section>

          <Section title={`Tasks (${tasks.length})`}>
            {tasks.length === 0 ? (
              <p className="text-[12px] text-muted">No tasks in this package.</p>
            ) : (
              <ul className="flex flex-col gap-1 list-none p-0 m-0">
                {tasks.map((task, i) => (
                  <li key={i} className="flex gap-2 text-[12px] text-primary">
                    <span className="font-semibold w-28 shrink-0">{task.task_no || '—'}</span>
                    <span className="flex-1">{task.task_description || '—'}</span>
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
            Cancel
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-[9px] text-sm font-semibold text-white bg-accent border-none cursor-pointer hover:opacity-90 transition-opacity font-sans"
          >
            <HiOutlinePrinter className="text-[15px]" />
            Print
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

// ── Print document ───────────────────────────────────────────────────────────

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// Builds a self-contained HTML document that mirrors the NAG IATF FORM 7 & 8
// "Sortie Report Form", then prints itself on load.
function buildPrintDocument(f: SortieFields, courseTitle: string, tasks: FlightPackageTask[]): string {
  const e = escapeHtml
  // Served from public/; absolute so the standalone print window can resolve it.
  const logoUrl = `${window.location.origin}/jac_logo.png`
  const rows = [...tasks]
  while (rows.length < MIN_TASK_ROWS) {
    rows.push({ task_master_id: 0, task_no: '', task_description: '' })
  }

  const taskRows = rows
    .map(
      (t) => `
        <tr>
          <td class="cell task-no">${e(t.task_no)}</td>
          <td class="cell task-desc">${e(t.task_description)}</td>
          <td class="cell grade"></td>
          <td class="cell grade"></td>
          <td class="cell grade"></td>
          <td class="cell grade"></td>
          <td class="cell grade"></td>
          <td class="cell grade"></td>
          <td class="cell remarks"></td>
        </tr>`,
    )
    .join('')

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Sortie Report Form</title>
<style>
  * { box-sizing: border-box; }
  /* margin:0 suppresses the browser's own print header/footer (date, title, URL). */
  @page { size: A4; margin: 0; }
  body { font-family: Arial, Helvetica, sans-serif; color: #000; font-size: 11px; margin: 0; padding: 14mm; }
  .titleblock { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px; }
  .logo { width: 50px; height: auto; flex: none; }
  .form-title { font-weight: bold; font-size: 13px; margin: 0; }
  table.form { width: 100%; border-collapse: collapse; }
  .section-bar { background: #000; color: #fff; font-weight: bold; text-align: center; padding: 3px; border: 1px solid #000; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .grid { width: 100%; border-collapse: collapse; margin-bottom: 0; }
  .grid td { border: 1px solid #000; padding: 4px 6px; vertical-align: top; }
  .label { font-weight: bold; white-space: nowrap; }
  .val { min-width: 60px; }
  .grade-tbl td { border: 1px solid #000; padding: 4px 6px; }
  table.tasks { width: 100%; border-collapse: collapse; }
  table.tasks th { border: 1px solid #000; background: #fff; font-weight: bold; padding: 4px 6px; text-align: left; }
  table.tasks .cell { border: 1px solid #000; padding: 6px; vertical-align: top; height: 28px; }
  table.tasks .task-no { width: 14%; font-weight: bold; }
  table.tasks .task-desc { width: 36%; }
  table.tasks th.grade, table.tasks .grade { width: 4%; text-align: center; }
  table.tasks .remarks { width: 26%; }
  .sign { width: 100%; border-collapse: collapse; margin-top: 10px; }
  .sign td { border: 1px solid #000; padding: 8px 6px; }
  .footer { display: flex; justify-content: space-between; font-size: 9px; margin-top: 8px; }
</style>
</head>
<body>
  <div class="titleblock">
    <p class="form-title">NAG IATF FORM 7 &amp; 8</p>
    <img class="logo" src="${logoUrl}" alt="Joint Aviation Command" />
  </div>

  <div class="section-bar">Personal Data</div>
  <table class="grid">
    <tr>
      <td class="label">Name:</td><td class="val">${e(f.name)}</td>
      <td class="label">Rank:</td><td class="val">${e(f.rank)}</td>
    </tr>
    <tr>
      <td class="label">Course:</td><td class="val">${e(courseTitle)}</td>
      <td class="label">Username:</td><td class="val">${e(f.username)}</td>
    </tr>
  </table>

  <div class="section-bar">Sortie Information</div>
  <table class="grid">
    <tr>
      <td class="label">Date:</td><td class="val">${e(f.date)}</td>
      <td class="label">Sortie Number:</td><td class="val">${e(f.sortieNumber)}</td>
      <td class="label">Sortie Detail:</td><td class="val">${e(f.sortieDetail)}</td>
    </tr>
  </table>
  <table class="grid grade-tbl">
    <tr>
      <td class="section-bar" colspan="2">Hrs Flown</td>
      <td class="section-bar" colspan="2">Instrument Flying details</td>
      <td class="section-bar" colspan="2">Grade &amp; Conditions</td>
    </tr>
    <tr>
      <td class="label">Day:</td><td class="val">${e(f.day)}</td>
      <td class="label">Simulated:</td><td class="val">${e(f.simulated)}</td>
      <td class="label">Sortie Grade:</td><td class="val">${e(f.sortieGrade)} %</td>
    </tr>
    <tr>
      <td class="label">Night:</td><td class="val">${e(f.night)}</td>
      <td class="label">Actual:</td><td class="val">${e(f.actual)}</td>
      <td class="label">Illum Data:</td><td class="val">${e(f.illumData)} %</td>
    </tr>
    <tr>
      <td class="label">NVG:</td><td class="val">${e(f.nvg)}</td>
      <td class="label">ILS No:</td><td class="val">${e(f.ilsNo)}</td>
      <td class="label">Weather:</td><td class="val">${e(f.weather)}</td>
    </tr>
    <tr>
      <td class="label">Total Flown:</td><td class="val">${e(f.totalFlown)}</td>
      <td class="label">VOR No:</td><td class="val">${e(f.vorNo)}</td>
      <td class="label">Approaches Flown:</td><td class="val">${e(f.approachesFlown)}</td>
    </tr>
  </table>

  <div class="section-bar">Sortie Report &ndash; Narrative, and Task Grade Slip</div>
  <table class="tasks">
    <thead>
      <tr>
        <th>Task No</th>
        <th>Task Description</th>
        <th class="grade">D</th>
        <th class="grade">1</th>
        <th class="grade">2</th>
        <th class="grade">3</th>
        <th class="grade">4</th>
        <th class="grade">5</th>
        <th>Remarks &amp; Comments</th>
      </tr>
    </thead>
    <tbody>
      ${taskRows}
    </tbody>
  </table>

  <table class="sign">
    <tr>
      <td class="section-bar">Instructor</td>
      <td class="section-bar">Student</td>
    </tr>
    <tr>
      <td>Name:<br/><br/>Signature:</td>
      <td>Name:<br/><br/>Signature:</td>
    </tr>
  </table>

  <div class="footer">
    <span>${e(courseTitle)}</span>
    <span>RESTRICTED</span>
  </div>

  <script>
    window.onload = function () {
      window.focus();
      window.print();
    };
    window.onafterprint = function () { window.close(); };
  </script>
</body>
</html>`
}
