import { useEffect, useState } from 'react'
import { HiOutlinePrinter, HiOutlineXMark } from 'react-icons/hi2'
import {
  colsForDayIndex,
  weekLength,
  type ScheduleConfig,
  type ScheduleDay,
  type ScheduleLesson,
} from './schedule-store'

interface Props {
  courseTitle: string
  days: ScheduleDay[]
  lessonsById: Record<string, ScheduleLesson>
  config: ScheduleConfig
  // Header label for the left-most column: "Day" for the Course Builder master
  // schedule (rows are "Day 1..N"), "Date" for Course Selection instances whose
  // rows carry real calendar dates. Defaults to "Day".
  dayColumnLabel?: string
  onClose: () => void
}

// Week-range picker for printing the schedule as a "Course Model Programme"
// document — one landscape A4 page per week, matching the reference layout
// (Day/Date column, numbered period columns + Late, code row over title row).
export default function SchedulePrintModal({ courseTitle, days, lessonsById, config, dayColumnLabel = 'Day', onClose }: Props) {
  const perWeek = weekLength(config)
  const weekCount = Math.max(1, Math.ceil(days.length / perWeek))

  const [fromWeek, setFromWeek] = useState(1)
  const [toWeek, setToWeek] = useState(weekCount)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Keep the range valid whichever end the user moves.
  const handleFrom = (w: number) => {
    setFromWeek(w)
    if (w > toWeek) setToWeek(w)
  }
  const handleTo = (w: number) => {
    setToWeek(w)
    if (w < fromWeek) setFromWeek(w)
  }

  const handlePrint = () => {
    const html = buildSchedulePrintDocument({ courseTitle, days, lessonsById, config, dayColumnLabel, fromWeek, toWeek })
    const win = window.open('', '_blank', 'width=1100,height=800')
    if (!win) return
    win.document.open()
    win.document.write(html)
    win.document.close()
  }

  const weekOptions = Array.from({ length: weekCount }, (_, i) => i + 1)
  const pages = toWeek - fromWeek + 1

  const selectCls =
    'px-2.5 py-1.5 rounded-[7px] bg-surface text-primary text-[13px] outline-none border border-[var(--border)] focus:border-accent cursor-pointer'

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-surface rounded-2xl border border-bd shadow-elevated w-full max-w-md overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 px-6 pt-5 pb-4 border-b border-bd">
          <div className="flex-1">
            <p className="text-[15px] font-bold text-primary leading-snug">Print Schedule</p>
            <p className="text-[12px] text-muted mt-0.5">{courseTitle || 'Untitled course'}</p>
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

        <div className="px-6 py-5 flex flex-col gap-4">
          <p className="text-[12px] text-secondary m-0">
            Choose the week range to print. Each week prints on its own landscape A4 page in the
            Course Model Programme layout.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold uppercase tracking-[0.05em] text-muted">From week</label>
              <select className={selectCls} value={fromWeek} onChange={(e) => handleFrom(Number(e.target.value))}>
                {weekOptions.map((w) => (
                  <option key={w} value={w}>Week {w}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold uppercase tracking-[0.05em] text-muted">To week</label>
              <select className={selectCls} value={toWeek} onChange={(e) => handleTo(Number(e.target.value))}>
                {weekOptions.map((w) => (
                  <option key={w} value={w}>Week {w}</option>
                ))}
              </select>
            </div>
          </div>
          <p className="text-[12px] text-muted m-0">
            {pages} {pages === 1 ? 'page' : 'pages'} · one week per page
          </p>
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

// ── Print document ───────────────────────────────────────────────────────────

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

interface BuildParams {
  courseTitle: string
  days: ScheduleDay[]
  lessonsById: Record<string, ScheduleLesson>
  config: ScheduleConfig
  dayColumnLabel: string
  fromWeek: number
  toWeek: number
}

// One day = two table rows sharing a merged day-label cell: a short shaded row
// of lesson codes and a taller white row of lesson titles, with colspans for
// multi-period blocks — exactly like the reference "Course Model Programme".
function dayRowsHtml(
  day: ScheduleDay,
  globalIndex: number,
  lessonsById: Record<string, ScheduleLesson>,
  config: ScheduleConfig,
): string {
  const e = escapeHtml
  const ncols = colsForDayIndex(globalIndex, config)
  const items = [...day.items].sort((a, b) => a.startCol - b.startCol)

  let codeCells = ''
  let titleCells = ''
  let col = 0
  for (const it of items) {
    const start = Math.max(it.startCol, col)
    if (start >= ncols) break
    const span = Math.min(it.span, ncols - start)
    for (; col < start; col++) {
      codeCells += '<td class="code"></td>'
      titleCells += '<td class="title"></td>'
    }
    const lesson = lessonsById[it.lessonId]
    codeCells += `<td class="code" colspan="${span}">${e(lesson?.lessonNumber ?? '')}</td>`
    titleCells += `<td class="title" colspan="${span}">${e(lesson?.lessonTitle ?? '')}</td>`
    col = start + span
  }
  for (; col < ncols; col++) {
    codeCells += '<td class="code"></td>'
    titleCells += '<td class="title"></td>'
  }
  // A half day exposes fewer periods than the grid — grey out the unusable tail.
  for (; col < config.periodsPerDay; col++) {
    codeCells += '<td class="na"></td>'
    titleCells += '<td class="na"></td>'
  }
  // Trailing "Late" column (part of the reference layout; no late placements exist).
  codeCells += '<td class="code"></td>'
  titleCells += '<td class="title"></td>'

  return `
      <tr><td class="day" rowspan="2">${e(day.dayLabel)}</td>${codeCells}</tr>
      <tr>${titleCells}</tr>`
}

function weekPageHtml(
  weekDays: ScheduleDay[],
  weekIndex: number,
  params: BuildParams,
): string {
  const e = escapeHtml
  const { courseTitle, lessonsById, config, dayColumnLabel } = params
  const perWeek = weekLength(config)
  const periodHeads = Array.from(
    { length: config.periodsPerDay },
    (_, i) => `<td class="head">${i + 1}</td>`,
  ).join('')
  const body = weekDays
    .map((day, di) => dayRowsHtml(day, weekIndex * perWeek + di, lessonsById, config))
    .join('')

  // The left column is narrower than the period columns, mirroring the reference
  // table. Date labels ("Mon, 05 Jan 2026") need a touch more room than "Day N".
  const dayWidth = dayColumnLabel === 'Day' ? 9 : 13
  const periodWidth = ((100 - dayWidth) / (config.periodsPerDay + 1)).toFixed(2)
  const cols =
    `<col style="width:${dayWidth}%" />` +
    `<col style="width:${periodWidth}%" span="${config.periodsPerDay + 1}" />`

  return `
  <div class="page">
    <div class="pagehead">
      <span>COURSE TITLE: ${e(courseTitle)}</span>
      <span>Course Model Programme</span>
    </div>
    <table>
      <colgroup>${cols}</colgroup>
      <tr>
        <td class="head" rowspan="2">${e(dayColumnLabel)}</td>
        <td class="head week-head" colspan="${config.periodsPerDay}">Week ${weekIndex + 1}</td>
        <td class="head"></td>
      </tr>
      <tr>${periodHeads}<td class="head">Late</td></tr>
      ${body}
    </table>
    <div class="pagefoot">
      <span>${e(courseTitle)}</span>
      <span>RESTRICTED</span>
    </div>
  </div>`
}

// Builds a self-contained HTML document that prints the selected weeks — one
// landscape A4 page per week — then triggers the print dialog on load.
export function buildSchedulePrintDocument(params: BuildParams): string {
  const { days, config, fromWeek, toWeek } = params
  const perWeek = weekLength(config)
  const weeks: ScheduleDay[][] = []
  for (let i = 0; i < days.length; i += perWeek) weeks.push(days.slice(i, i + perWeek))

  const pages = weeks
    .map((weekDays, wi) => ({ weekDays, wi }))
    .filter(({ wi }) => wi + 1 >= fromWeek && wi + 1 <= toWeek)
    .map(({ weekDays, wi }) => weekPageHtml(weekDays, wi, params))
    .join('')

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Course Model Programme</title>
<style>
  * { box-sizing: border-box; }
  /* margin:0 suppresses the browser's own print header/footer (date, title, URL). */
  @page { size: A4 landscape; margin: 0; }
  body { font-family: Arial, Helvetica, sans-serif; color: #000; font-size: 10px; margin: 0; }
  .page { padding: 10mm 12mm; break-after: page; }
  .page:last-child { break-after: auto; }
  .pagehead { display: flex; justify-content: space-between; font-weight: bold; font-size: 11px; margin-bottom: 4mm; }
  .pagefoot { display: flex; justify-content: space-between; font-size: 9px; margin-top: 4mm; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  td { border: 1px solid #000; text-align: center; vertical-align: middle; padding: 2px 3px; overflow: hidden; overflow-wrap: break-word; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .head { background: #CBFFFF; font-weight: bold; height: 7mm; }
  .week-head { font-size: 12px; }
  .day { background: #FFFF99; font-weight: bold; }
  .code { background: #CBFFFF; font-weight: bold; height: 5mm; }
  .title { height: 16mm; }
  .na { background: #E5E5E5; }
</style>
</head>
<body>
  ${pages}
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
