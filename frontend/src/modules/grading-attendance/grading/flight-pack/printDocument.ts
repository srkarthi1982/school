export interface FlightPackageTask {
  task_master_id: number
  task_no: string
  task_description: string
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// Minimum grading rows so the printed form keeps its shape.
const MIN_TASK_ROWS = 8

export function buildPrintDocument(
  f: Record<string, string>,
  courseTitle: string,
  tasks: FlightPackageTask[],
): string {
  const e = escapeHtml
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
    <tr><td class="label">Name:</td><td class="val">${e(f.studentName)}</td>
        <td class="label">Rank:</td><td class="val">${e(f.rank)}</td></tr>
    <tr><td class="label">Course:</td><td class="val">${e(courseTitle)}</td>
        <td class="label">Unit:</td><td class="val">${e(f.username || '')}</td></tr>
  </table>

  <div class="section-bar">Sortie Information</div>
  <table class="grid">
    <tr><td class="label">Date:</td><td class="val">${e(f.date)}</td>
        <td class="label">Sortie Number:</td><td class="val">${e(f.sortieNumber)}</td>
        <td class="label">Sortie Detail:</td><td class="val">${e(f.sortieDetail)}</td></tr>
  </table>
  <table class="grid grade-tbl">
    <tr>
      <td class="section-bar" colspan="2">Hrs Flown</td>
      <td class="section-bar" colspan="2">Instrument Flying details</td>
      <td class="section-bar" colspan="2">Grade &amp; Conditions</td>
    </tr>
    <tr><td class="label">Day:</td><td class="val">${e(f.day)}</td>
        <td class="label">Simulated:</td><td class="val">${e(f.simulated)}</td>
        <td class="label">Sortie Grade:</td><td class="val">${e(f.sortieGrade)} %</td></tr>
    <tr><td class="label">Night:</td><td class="val">${e(f.night)}</td>
        <td class="label">Actual:</td><td class="val">${e(f.actual)}</td>
        <td class="label">Illum Data:</td><td class="val">${e(f.illumData)} %</td></tr>
    <tr><td class="label">NVG:</td><td class="val">${e(f.nvg)}</td>
        <td class="label">ILS No:</td><td class="val">${e(f.ilsNo)}</td>
        <td class="label">Weather:</td><td class="val">${e(f.weather)}</td></tr>
    <tr><td class="label">Total Flown:</td><td class="val">${e(f.totalFlown)}</td>
        <td class="label">VOR No:</td><td class="val">${e(f.vorNo)}</td>
        <td class="label">Approaches Flown:</td><td class="val">${e(f.approachesFlown)}</td></tr>
  </table>

  <div class="section-bar">Sortie Report &ndash; Narrative, and Task Grade Slip</div>
  <table class="tasks">
    <thead><tr>
      <th>Task No</th><th>Task Description</th>
      <th class="grade">D</th><th class="grade">1</th><th class="grade">2</th>
      <th class="grade">3</th><th class="grade">4</th><th class="grade">5</th>
      <th>Remarks &amp; Comments</th>
    </tr></thead>
    <tbody>${taskRows}</tbody>
  </table>

  <table class="sign">
    <tr><td class="section-bar">Instructor</td><td class="section-bar">Student</td></tr>
    <tr><td>Name:<br/><br/>Signature:</td><td>Name:<br/><br/>Signature:</td></tr>
  </table>

  <div class="footer"><span>${e(courseTitle)}</span><span>RESTRICTED</span></div>

  <script>window.onload = function () { window.focus(); window.print(); };
         window.onafterprint = function () { window.close(); };</script>
</body>
</html>`
}
