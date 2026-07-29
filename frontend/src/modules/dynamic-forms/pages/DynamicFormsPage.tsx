import React, { useState, useCallback } from 'react'
import './DynamicTable.css'
import {
  HiOutlineTableCells,
  HiOutlinePlus,
  HiOutlineMinus,
  HiOutlineArrowsPointingOut,
  HiOutlineArrowDownTray,
  HiOutlineInformationCircle,
} from 'react-icons/hi2'
import SectionHeader from '../../../infra/shared/components/SectionHeader'

import {  
  listDynamicFormsNoCourseApiV1FormsNoCourseGet as listForms,
  getDynamicFormApiV1FormsFormIdGet as getForm,
  createDynamicFormApiV1FormsPost as createForm,
  updateDynamicFormApiV1FormsFormIdPut as updateForm,
  deleteDynamicFormApiV1FormsFormIdDelete as deleteForm,
  listDynamicFormsByCourseApiV1FormsHasCourseByTitleGet as listCourseForm,
  listCourseNamesApiV1FormsCoursesGet as listCourseNames

 } from '../../../api/generated'
import { confirmDialog } from '../../../infra/shared/store/useConfirmStore'
import useToastStore from '../../../infra/shared/store/useToastStore'

// ─── Types ────────────────────────────────────────────────────────────────────

interface CellData {
  value: string
  mergedWith?: string
  textareaRows?: number
  splits?: string[]
}

interface RowData {
  [key: number]: CellData
}

interface FormItem {
  id: number
  title: string
  course_name: string
}

// ─── Cell merge helpers ───────────────────────────────────────────────────────

const getMergedWith = (cellData: RowData[], row: number, col: number) => {
  const cell = cellData[row]?.[col]
  if (!cell?.mergedWith) return null
  const [r, c] = cell.mergedWith.split('-').map(Number)
  return { row: r, col: c }
}

const isCellMerged = (cellData: RowData[], row: number, col: number): boolean => {
  const cell = cellData[row]?.[col]
  if (cell?.mergedWith) return true
  for (const rowObj of cellData) {
    for (const cellObj of Object.values(rowObj)) {
      if (cellObj?.mergedWith === `${row}-${col}`) return true
    }
  }
  return false
}

const canMergeCells = (cellData: RowData[], startRow: number, startCol: number, endRow: number, endCol: number): boolean => {
  const minCol = Math.min(startCol, endCol), maxCol = Math.max(startCol, endCol)
  const minRow = Math.min(startRow, endRow), maxRow = Math.max(startRow, endRow)
  for (let i = minRow; i <= maxRow; i++) {
    for (let j = minCol; j <= maxCol; j++) {
      const mw = getMergedWith(cellData, i, j)
      if (mw && (mw.row < minRow || mw.row > maxRow || mw.col < minCol || mw.col > maxCol)) return false
    }
  }
  return true
}

const mergeCellsHelper = (cellData: RowData[], startRow: number, startCol: number, endRow: number, endCol: number): RowData[] => {
  const newData = cellData.map(row => ({ ...row }))
  let combinedValue = newData[startRow]?.[startCol]?.value || ''
  const rightmostCell = newData[startRow]?.[endCol]
  if (rightmostCell) combinedValue = rightmostCell.value || combinedValue
  for (let i = startRow; i <= endRow; i++) {
    for (let j = startCol; j <= endCol; j++) {
      if (i !== startRow || j !== startCol) {
        if (!newData[i]) newData[i] = {}
        newData[i] = { ...newData[i], [j]: { ...newData[i]?.[j], value: '', mergedWith: `${startRow}-${startCol}` } }
      }
    }
  }
  if (!newData[startRow]) newData[startRow] = {}
  newData[startRow] = { ...newData[startRow], [startCol]: { ...newData[startRow]?.[startCol], value: combinedValue } }
  return newData
}

const unmergeCellsHelper = (cellData: RowData[], row: number, col: number, rowCount: number, colCount: number): RowData[] => {
  const newData = cellData.map(row => ({ ...row }))
  if (!newData[row]) return cellData
  const cell = newData[row][col]
  if (!cell) return cellData
  newData[row] = { ...newData[row], [col]: { ...cell, mergedWith: undefined } }
  for (let i = 0; i < rowCount; i++) {
    for (let j = 0; j < colCount; j++) {
      const targetCell = newData[i]?.[j]
      if (targetCell?.mergedWith === `${row}-${col}`) {
        newData[i] = { ...newData[i], [j]: { ...targetCell, mergedWith: undefined } }
      }
    }
  }
  return newData
}

// ─── Design system button ─────────────────────────────────────────────────────

function Btn({ variant = 'primary', size = 'md', disabled, children, onClick, title, dataGuide }: {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  size?: 'sm' | 'md'
  disabled?: boolean
  children: React.ReactNode
  onClick?: () => void
  title?: string
  dataGuide?: string
}) {
  const h = size === 'sm' ? 30 : 36
  const px = size === 'sm' ? '0 11px' : '0 15px'
  const fs = size === 'sm' ? 12 : 13
  const v: Record<string, React.CSSProperties> = {
    primary:   { background: 'var(--accent)',             color: '#fff',                    border: '1.5px solid transparent' },
    secondary: { background: 'var(--surface-2)',          color: 'var(--text-primary)',      border: '1.5px solid var(--border)' },
    danger:    { background: 'rgba(220,38,38,0.08)',      color: '#DC2626',                 border: '1.5px solid rgba(220,38,38,0.25)' },
    ghost:     { background: 'transparent',               color: 'var(--text-secondary)',   border: '1.5px solid transparent' },
  }
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      data-guide={dataGuide}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        height: h, padding: px, fontSize: fs, fontWeight: 600,
        fontFamily: 'var(--font)', borderRadius: 9,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        whiteSpace: 'nowrap', transition: 'opacity 0.15s',
        ...v[variant],
      }}
    >
      {children}
    </button>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const DynamicFormsPage: React.FC = () => {
  const initialRows = 5, initialCols = 4

  const [rowCount, setRowCount]     = useState(initialRows)
  const [colCount, setColCount]     = useState(initialCols)
  const [cellData, setCellData]     = useState<RowData[]>(() => {
    const d: RowData[] = []
    for (let i = 0; i < initialRows; i++) {
      const r: RowData = {}
      for (let j = 0; j < initialCols; j++) r[j] = { value: '' }
      d.push(r)
    }
    return d
  })
  const [selection, setSelection] = useState<{ row: number; startCol: number; endCol: number } | null>(null)
  const [isSelecting, setIsSelecting] = useState(false)
  const [columnWidths, setColumnWidths]   = useState<number[]>(() => Array(initialCols).fill(150))
  const [rowHeights, setRowHeights]       = useState<number[]>(() => Array(initialRows).fill(40))
  const [forms, setForms]                 = useState<FormItem[]>([])
  const [selectedForm, setSelectedForm]   = useState<FormItem | undefined>()
  const [courses, setCourses]                 = useState<FormItem[]>([])  
  const [selectedCourse, setSelectedCourse]   = useState<FormItem | null>(null)
  const [isSelectingCourseName, setIsSelectingCourseName] = useState<boolean>(false)
  const [courseNames, setCourseNames]         = useState<string[]>([])
  const [newCourseName, setNewCourseName] = useState<string>('')
  const [isOpeningCourseForm, setIsOpeningCourseForm] = useState<boolean>(false)
  const [isLoading, setIsLoading]         = useState(false)
  const [tableTitle, setTableTitle]       = useState<string>('')
  const [courseName, setCourseName]       = useState<string>('')
  const [isCopyingForm, setIsCopyingForm]       = useState<boolean>(false)
  const [triggerLoad, setTriggerLoad]     = useState(false)
  const [tableDescription, setTableDescription] = useState<string>("")
  const [version, setVersion] = React.useState<number>();
  const [isNewForm, setIsNewForm] = useState(true)
  const [isEditing, setIsEditing] = useState(false)

  const isInitialMount   = React.useRef(true)
  const pendingLoadData  = React.useRef<{ rowCount: number; colCount: number; columnWidths: number[]; rowHeights: number[]; cellData: RowData[]; title: string
    , description: string, version: number, course_name:string
   } | null>(null)
  const columnWidthsRef  = React.useRef<number[]>(Array(initialCols).fill(150))
  const textareaRefs     = React.useRef<Map<string, HTMLTextAreaElement>>(new Map())
  const tableRef         = React.useRef<HTMLTableElement>(null)
  const resizeHandleRef  = React.useRef<HTMLDivElement>(null)
  const isResizingRef    = React.useRef(false)
  const isTableResizingRef = React.useRef(false)
  const startXRef        = React.useRef(0)

  // ── Resize: column ─────────────────────────────────────────────────────────

  const handleColumnResizeStart = React.useCallback((colIndex: number) => (e: React.MouseEvent) => {
    e.preventDefault()
    isResizingRef.current = true
    const startX = e.clientX
    const widths = columnWidthsRef.current
    const leftStart = widths[colIndex]
    const rightStart = widths[colIndex + 1]
    const table = tableRef.current
    const move = (ev: MouseEvent) => {
      const delta = ev.clientX - startX
      if (colIndex === colCount - 1) {
        const newW = Math.max(400, (table?.offsetWidth || 0) + delta)
        if (table) table.style.width = `${newW}px`
        return
      }
      setColumnWidths(prev => {
        const updated = [...prev]
        updated[colIndex]     = Math.max(50, leftStart  + delta)
        updated[colIndex + 1] = Math.max(50, rightStart - delta)
        columnWidthsRef.current = updated
        return updated
      })
    }
    const up = () => { isResizingRef.current = false; document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up) }
    document.addEventListener('mousemove', move)
    document.addEventListener('mouseup', up)
  }, [colCount])

  // ── Resize: row ───────────────────────────────────────────────────────────

  const handleRowResizeStart = React.useCallback((rowIndex: number) => (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation()
    const startY = e.clientY
    const startH = rowHeights[rowIndex] || 40
    const move = (ev: MouseEvent) => setRowHeights(prev => { const u = [...prev]; u[rowIndex] = Math.max(30, startH + (ev.clientY - startY)); return u })
    const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up) }
    document.addEventListener('mousemove', move)
    document.addEventListener('mouseup', up)
  }, [rowHeights])

  // ── Dimension sync ────────────────────────────────────────────────────────

  const ensureDimensions = useCallback((forceUpdate?: boolean) => {
    const newData: RowData[] = []
    for (let i = 0; i < rowCount; i++) {
      const rowData: RowData = {}
      for (let j = 0; j < colCount; j++) {
        if (cellData[i] && cellData[i][j]) rowData[j] = { ...cellData[i][j] }
        else if (forceUpdate) rowData[j] = { value: '' }
      }
      if (forceUpdate || Object.keys(rowData).length > 0) newData.push(rowData)
    }
    if (newData.length > 0 || forceUpdate) setCellData(newData)
  }, [rowCount, colCount])

  React.useEffect(() => {
    if (!isInitialMount.current) ensureDimensions(true)
    else isInitialMount.current = false
  }, [ensureDimensions])

  React.useEffect(() => {
    if (triggerLoad && pendingLoadData.current) {
      const { rowCount: r, colCount: c, columnWidths: cw, rowHeights: rh, cellData: cd, title: t, description:d, version:v, course_name:cn } = pendingLoadData.current
      setRowCount(r); setColCount(c); setCellData(cd); setColumnWidths(cw); setRowHeights(rh); setTableTitle(t), setNewCourseName(cn);
      setTableDescription(d); setVersion(v);
      setSelection(null)
      pendingLoadData.current = null; setTriggerLoad(false)
    }
  }, [triggerLoad])

  React.useEffect(() => {
    setColumnWidths(prev => { const u = [...prev]; while (u.length < colCount) u.push(150); return u.slice(0, colCount) })
  }, [colCount])

  React.useEffect(() => {
    setRowHeights(prev => { const u = [...prev]; while (u.length < rowCount) u.push(40); return u.slice(0, rowCount) })
  }, [rowCount])

  React.useEffect(() => {
    const table = tableRef.current
    const wrapper = document.querySelector('.table-scroll-wrapper') as HTMLDivElement
    if (table && wrapper && !isResizingRef.current && !isTableResizingRef.current) {
      const w = wrapper.clientWidth
      if (w > 0) table.style.width = `${w}px`
    }
  }, [])

  const recalcTextareaHeights = React.useCallback((rowIndex: number) => {
    const dataRowIdx = rowIndex - 1
    const avail = Math.max(30, (rowHeights[dataRowIdx] || rowHeights[rowIndex] || 40) - 8)
    textareaRefs.current.forEach((ta, key) => {
      if (key.startsWith(`${rowIndex}-`)) {
        ta.style.height = `${avail}px`
      }
    })
  }, [rowHeights])

  React.useEffect(() => {
    for (let i = 1; i < rowCount; i++) requestAnimationFrame(() => recalcTextareaHeights(i))
  }, [rowHeights, rowCount, recalcTextareaHeights])

  // ── Cell interactions ─────────────────────────────────────────────────────

  const handleCellChange = (row: number, col: number, value: string) => {
    setCellData(prev => {
      const d = [...prev]
      if (!d[row]) d[row] = {}
      d[row] = { ...d[row], [col]: { ...d[row]?.[col], value, mergedWith: d[row]?.[col]?.mergedWith } }
      return d
    })
    setIsEditing(true)
  }

  const handleTextareaRowsChange = (row: number, col: number, rows: number) => {
    setCellData(prev => {
      const d = [...prev]; if (!d[row]) d[row] = {}
      d[row] = { ...d[row], [col]: { ...d[row]?.[col], textareaRows: rows } }
      return d
    })
  }

  const addRow    = useCallback(() => {
    const insertAt = selection ? selection.row + 1 : rowCount
    setCellData(prev => {
      const shifted = prev.map(row => {
        const newRow: RowData = {}
        for (const k of Object.keys(row)) {
          const j = Number(k)
          const cell = row[j]
          if (cell?.mergedWith) {
            const [r, c] = cell.mergedWith.split('-').map(Number)
            newRow[j] = { ...cell, mergedWith: r >= insertAt ? `${r + 1}-${c}` : cell.mergedWith }
          } else {
            newRow[j] = { ...cell }
          }
        }
        return newRow
      })
      const emptyRow: RowData = {}
      for (let j = 0; j < colCount; j++) emptyRow[j] = { value: '' }
      shifted.splice(insertAt, 0, emptyRow)
      return shifted
    })
    setRowHeights(prev => {
      const u = [...prev]
      u.splice(insertAt, 0, 40)
      return u
    })
    setRowCount(p => p + 1)
  }, [selection, rowCount, colCount])
  const removeRow = useCallback(async () => {
    if (rowCount <= 1) return
    const removeAt = selection ? selection.row : rowCount - 1
    if (removeAt < 0 || removeAt >= rowCount) return
    const rowHasData = Object.values(cellData[removeAt] || {}).some(c => (c?.value ?? '').trim().length > 0)
    if (rowHasData && !(await confirmDialog({ title: 'Delete row?', message: 'This row contains data. Are you sure you want to delete it?', confirmLabel: 'Delete', tone: 'danger' }))) return
    setCellData(prev => {
      const next = prev
        .filter((_, i) => i !== removeAt)
        .map(row => {
          const newRow: RowData = {}
          for (const k of Object.keys(row)) {
            const j = Number(k)
            const cell = row[j]
            if (cell?.mergedWith) {
              const [r, c] = cell.mergedWith.split('-').map(Number)
              if (r === removeAt) {
                newRow[j] = { ...cell, mergedWith: undefined }
              } else {
                newRow[j] = { ...cell, mergedWith: r > removeAt ? `${r - 1}-${c}` : cell.mergedWith }
              }
            } else {
              newRow[j] = { ...cell }
            }
          }
          return newRow
        })
      return next
    })
    setRowHeights(prev => prev.filter((_, i) => i !== removeAt))
    setRowCount(p => p - 1)
  }, [selection, rowCount, cellData])
  const addCol    = useCallback(() => {
    const insertAt = selection ? Math.max(selection.startCol, selection.endCol) + 1 : colCount
    setCellData(prev => prev.map(row => {
      const newRow: RowData = {}
      for (const k of Object.keys(row)) {
        const j = Number(k)
        const cell = row[j]
        if (!cell) continue
        const newJ = j >= insertAt ? j + 1 : j
        let newMergedWith = cell.mergedWith
        if (cell.mergedWith) {
          const [r, c] = cell.mergedWith.split('-').map(Number)
          if (c >= insertAt) newMergedWith = `${r}-${c + 1}`
        }
        newRow[newJ] = { ...cell, mergedWith: newMergedWith }
      }
      newRow[insertAt] = { value: '' }
      return newRow
    }))
    setColumnWidths(prev => {
      const u = [...prev]
      u.splice(insertAt, 0, 150)
      columnWidthsRef.current = u
      return u
    })
    setColCount(p => p + 1)
  }, [selection, colCount])
  const removeCol = useCallback(async () => {
    if (colCount <= 1) return
    const removeAt = selection ? Math.min(selection.startCol, selection.endCol) : colCount - 1
    if (removeAt < 0 || removeAt >= colCount) return
    const colHasData = cellData.some(row => (row?.[removeAt]?.value ?? '').trim().length > 0)
    if (colHasData && !(await confirmDialog({ title: 'Delete column?', message: 'This column contains data. Are you sure you want to delete it?', confirmLabel: 'Delete', tone: 'danger' }))) return
    setCellData(prev => prev.map(row => {
      const newRow: RowData = {}
      for (const k of Object.keys(row)) {
        const j = Number(k)
        if (j === removeAt) continue
        const cell = row[j]
        if (!cell) continue
        const newJ = j > removeAt ? j - 1 : j
        let newMergedWith = cell.mergedWith
        if (cell.mergedWith) {
          const [r, c] = cell.mergedWith.split('-').map(Number)
          if (c === removeAt) newMergedWith = undefined
          else if (c > removeAt) newMergedWith = `${r}-${c - 1}`
        }
        newRow[newJ] = { ...cell, mergedWith: newMergedWith }
      }
      return newRow
    }))
    setColumnWidths(prev => {
      const u = prev.filter((_, i) => i !== removeAt)
      columnWidthsRef.current = u
      return u
    })
    setColCount(p => p - 1)
  }, [selection, colCount, cellData])


  const isSelectingRef = React.useRef(false)

  const handleCellMouseDown = (e: React.MouseEvent, row: number, col: number) => {
    if (e.shiftKey && selection && selection.row === row) {
      setSelection({ ...selection, endCol: col })
    } else {
      setSelection({ row, startCol: col, endCol: col })
    }
    isSelectingRef.current = true
    setIsSelecting(true)
  }

  const handleCellMouseOver = (row: number, col: number) => {
    if (!isSelectingRef.current) return
    setSelection(prev => {
      if (!prev || prev.row !== row || prev.endCol === col) return prev
      return { ...prev, endCol: col }
    })
  }

  React.useEffect(() => {
    if (!isSelecting) return
    const up = () => {
      isSelectingRef.current = false
      setIsSelecting(false)
    }
    document.addEventListener('mouseup', up)
    return () => document.removeEventListener('mouseup', up)
  }, [isSelecting])

  const mergeSelection = () => {
    if (!selection) return
    const { row, startCol, endCol } = selection
    if (startCol === endCol) return
    const sc = Math.min(startCol, endCol)
    const ec = Math.max(startCol, endCol)
    const effectiveEc = ec + (getColSpan(row, ec) || 1) - 1
    if (canMergeCells(cellData, row, sc, row, effectiveEc)) {
      setCellData(mergeCellsHelper(cellData, row, sc, row, effectiveEc))
      setSelection({ row, startCol: sc, endCol: sc })
    }
  }

  const unmergeSelection = () => {
    if (!selection || selection.startCol !== selection.endCol) return
    setCellData(unmergeCellsHelper(cellData, selection.row, selection.startCol, rowCount, colCount))
  }

  const splitSelection = () => {
    if (!selection || selection.startCol !== selection.endCol) return
    const { row, startCol } = selection
    setCellData(prev => {
      const d = prev.map(r => ({ ...r }))
      if (!d[row]) d[row] = {}
      const cur = d[row][startCol] || { value: '' }
      const splits = cur.splits && cur.splits.length > 0 ? [...cur.splits, ''] : [cur.value || '', '']
      d[row] = { ...d[row], [startCol]: { ...cur, splits } }
      return d
    })
    setIsEditing(true)
  }

  const unsplitSelection = () => {
    if (!selection || selection.startCol !== selection.endCol) return
    const { row, startCol } = selection
    setCellData(prev => {
      const d = prev.map(r => ({ ...r }))
      const cur = d[row]?.[startCol]
      if (!cur?.splits || cur.splits.length === 0) return prev
      const combined = cur.splits.filter(s => s && s.length > 0).join(' ') || cur.value || ''
      const { splits, ...rest } = cur
      d[row] = { ...d[row], [startCol]: { ...rest, value: combined } }
      return d
    })
    setIsEditing(true)
  }

  const handleSplitChange = (row: number, col: number, idx: number, value: string) => {
    setCellData(prev => {
      const d = [...prev]
      if (!d[row]) d[row] = {}
      const cur = d[row]?.[col] || { value: '' }
      const splits = [...(cur.splits || [])]
      splits[idx] = value
      d[row] = { ...d[row], [col]: { ...cur, splits } }
      return d
    })
    setIsEditing(true)
  }

  // Clear selection when data bounds shrink below current selection (reload, row/col remove).
  React.useEffect(() => {
    setSelection(prev => {
      if (!prev) return prev
      if (prev.row >= rowCount || prev.startCol >= colCount || prev.endCol >= colCount) return null
      return prev
    })
  }, [rowCount, colCount])

  // ── Span calculation ──────────────────────────────────────────────────────

  const getColSpan = (rowIndex: number, colIndex: number): number => {
    if (getMergedWith(cellData, rowIndex, colIndex)) return 0
    let span = 1
    for (let j = colIndex + 1; j < colCount; j++) {
      const mw = getMergedWith(cellData, rowIndex, j)
      if (mw && mw.row === rowIndex && mw.col === colIndex) span++
      else break
    }
    return span
  }

  // ── Save / Load ───────────────────────────────────────────────────────────

  const saveToJSON = async () => {
    const headerRow = cellData[0] || {}
    const headerCells = Array.from({ length: colCount }, (_, i) => ({
      value: headerRow[i]?.value || '', mergedWith: headerRow[i]?.mergedWith ?? undefined,
      splits: headerRow[i]?.splits,
    }))
    const dataRows = Array.from({ length: rowCount - 1 }, (_, i) =>
      Array.from({ length: colCount }, (_, j) => ({
        value: cellData[i + 1]?.[j]?.value || '', mergedWith: cellData[i + 1]?.[j]?.mergedWith ?? undefined,
        splits: cellData[i + 1]?.[j]?.splits,
      }))
    )
    const exportData: { title: string; description: string; form_metadata: string; data: string; version?: number, course_name?:string } = {
      title: tableTitle,
      description: tableDescription,
      form_metadata: JSON.stringify({ colCount, columnWidths, headerCells }),
      data: JSON.stringify({ rowCount, rowHeights, dataRows })
    }
    exportData.version = version

    setIsLoading(true)

    const alertSuccess = () => useToastStore.getState().push({ variant: 'success', title: 'Form saved successfully!' })
    try {
      if(isNewForm || isCopyingForm){
        exportData.course_name = newCourseName;

        const createRes = await createForm({body:exportData})
        if(!createRes.data?.success) {
          const errorObj = createRes.error as any
          useToastStore.getState().push({ variant: 'error', title: 'Error saving form: ' + errorObj.error?.message });
          return
        }
        
        alertSuccess();

        // reload form list and refresh selectd form
        const resp = await listForms()
        const forms: FormItem[] =  (resp.data?.data || []) as FormItem[]

        setForms(forms)
        const selectedForm = forms.find(x => x.title === exportData.title)
        if(selectedForm) {
          // set selected form and open
          setSelectedForm(selectedForm)
          setNewCourseName(selectedForm.course_name)
          loadFormFromAPI(selectedForm.id)
          setIsNewForm(false)
          setIsEditing(false)
          setIsCopyingForm(false)
        }

      } else if (selectedForm && version !== undefined) {
        const updateData: { version: number; title?: string; description?: string; form_metadata?: string; data?: string, course_name?:string } = {
          version: version,
          title: tableTitle,
          course_name : newCourseName,
          description: tableDescription,
          form_metadata: JSON.stringify({ colCount, columnWidths, headerCells }),
          data: JSON.stringify({ rowCount, rowHeights, dataRows })
        }
        const updateRes = await updateForm({body: updateData, path: {form_id: selectedForm.id }})
        if(!updateRes.data?.success) {
          const errorUpdObj = updateRes.error as any;
          useToastStore.getState().push({ variant: 'error', title: 'Error saving form: ' + errorUpdObj.error?.message });
          return
        }
        alertSuccess();
        loadFormFromAPI(selectedForm.id)
      }
      
      setIsEditing(false)
    } catch (error) {
      useToastStore.getState().push({ variant: 'error', title: 'Error saving form data' })
      console.error(error)
    } finally {
      setIsLoading(false)
    }

    // const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
    // const url = URL.createObjectURL(blob)
    // const a = document.createElement('a')
    // a.href = url; a.download = 'table-data.json'; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url)
  }

  const applyLoadedData = (data: any) => {
    const version = data.version
    const title = data.title
    const course_name = data.courseName
    const description = data.description
    const colCount   = data.form_metadata?.colCount || data.colCount
    const headerCells= data.form_metadata?.headerCells || data.headerCells
    const colWidths  = data.form_metadata?.columnWidths || data.columnWidths
    const rowCount   = data.data?.rowCount || data.rowCount
    const rowHts     = data.data?.rowHeights || data.rowHeights
    const dataRows   = data.data?.dataRows
    if (!rowCount || !colCount || !Array.isArray(headerCells) || !Array.isArray(dataRows)) { useToastStore.getState().push({ variant: 'warning', title: 'Invalid form data format' }); return }
    const newCellData: RowData[] = []
    const headerRow: RowData = {}
    for (let j = 0; j < colCount; j++) headerRow[j] = { value: headerCells[j]?.value || '', mergedWith: headerCells[j]?.mergedWith, splits: headerCells[j]?.splits }
    newCellData.push(headerRow)
    for (let i = 0; i < dataRows.length; i++) {
      const rd: RowData = {}
      for (let j = 0; j < colCount; j++) rd[j] = { value: dataRows[i]?.[j]?.value || '', mergedWith: dataRows[i]?.[j]?.mergedWith, splits: dataRows[i]?.[j]?.splits }
      newCellData.push(rd)
    }
    pendingLoadData.current = { rowCount, colCount, cellData: newCellData, columnWidths: Array.isArray(colWidths) ? colWidths : Array(colCount).fill(150), rowHeights: Array.isArray(rowHts) ? rowHts : Array(rowCount).fill(40), title, description, version, course_name }
    if (Array.isArray(colWidths)) columnWidthsRef.current = colWidths
    setTriggerLoad(true)
  }

  function resetTable() {
    const colCount = initialCols;
    const rowCount = initialRows;

    // Guard against non‑numeric or non‑positive inputs
    if (!Number.isInteger(colCount) || colCount <= 0) {
      throw new Error('colCount must be a positive integer');
    }
    if (!Number.isInteger(rowCount) || rowCount <= 0) {
      throw new Error('rowCount must be a positive integer');
    }

    setIsLoading(true)
    // Helper to create an array filled with the same value
    
    const fillArray = (length:number, value:any) => Array.from({ length }, () => value);
    // ---- form_metadata -------------------------------------------------------
    const form_metadata = {
      colCount: colCount,
      columnWidths: fillArray(colCount, 150),           // 150px for each column
      headerCells: fillArray(colCount, { value: '' })  // empty header cells
    };

    // ---- data ----------------------------------------------------------------
    const data = {
      rowCount: rowCount,
      rowHeights: fillArray(rowCount, 40),              // 40px for each row
      // Build an array (rowCount) of arrays (colCount) of {value: ''}
      dataRows: Array.from({ length: rowCount }, () =>
        fillArray(colCount, { value: '' })
      )
    };

    applyLoadedData( {
      title:'',
      courseName:'',
      description:'',
      form_metadata,
      data
    })

    setIsLoading(false)
  }

  const loadFormFromAPI = async (formId: number, copyForm=false) => {
    setIsLoading(true)
    try {
      const resp = await getForm({path:{form_id:formId}});
      const formData = resp.data;
      if (!formData) return;
      const fillArray = (length:number, value:any) => Array.from({ length }, () => value);
      
      const jsonData = copyForm 
        ? 
        {
          rowCount: rowCount,
          rowHeights: fillArray(rowCount, 40),              // 40px for each row
          // Build an array (rowCount) of arrays (colCount) of {value: ''}
          dataRows: Array.from({ length: rowCount }, () => fillArray(colCount, { value: '' })) 
        }
        : 
        (formData.data?.data ? JSON.parse(formData.data.data) : { dataRows: [] })

      applyLoadedData({
        title: formData.data?.title || '',
        courseName: formData.data?.course_name || '',
        description: formData.data?.description || '',
        version: formData.data?.version || 0,
        form_metadata: formData.data?.form_metadata ? JSON.parse(formData.data.form_metadata) : [],
        data: jsonData
      })

      // if(!isCopyingForm){
      //   // load courses
      //   const courseResp = await listCourseForm({query:{title:formData.data?.title}})
      //   const courses = courseResp.data ? courseResp.data.data : []
      //   setCourses(courses)
      // }
    } catch { useToastStore.getState().push({ variant: 'error', title: 'Error loading form data' }) } finally { setIsLoading(false) }
  }


  const deleteFormApi = async (formId:number) =>{
        const resp = await deleteForm({path:{form_id:formId}})
        if(!resp.response.ok) return;

        // reload form list
        const listResp = await listForms()
        const forms: FormItem[] = (listResp.data?.data || [])  as FormItem[]
        
        setForms(forms)                
        // reset course
        setSelectedCourse(null)
        if(selectedForm) {
          const selectedFormNew = forms.find(x => x.id === selectedForm.id)
          setSelectedForm(selectedFormNew)
          if(selectedFormNew)
            loadFormFromAPI(selectedFormNew.id)    
          else
            resetTable()
        }        
        setIsOpeningCourseForm(prev => false)
        setIsNewForm(true)
  }

  const fetchAvaiableCourse = async () => {
    const resp = listCourseNames({});
    setCourseNames((await resp).data?.data || [])
  }
  // ── Fetch form list ───────────────────────────────────────────────────────

  React.useEffect(() => {
    const fetchForms = async () => {
      setIsLoading(true)
      try {
        const resp = await listForms({})
        const data: FormItem[] = (resp.data?.data || []) as FormItem[]
        
        setForms(data)        
      } catch { setForms([]) } finally { setIsLoading(false) }
    }
    fetchForms()
  }, [])

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div>

      {/* Page header */}
      <SectionHeader
        className="mb-4"
        eyebrow="DYNAMIC FORMS"
        icon={<HiOutlineTableCells />}
        title="Dynamic Forms"
        description="Build and fill dynamic forms with resizable columns, rows, and cell merging."
      />

      {/* Toolbar card — form selector + open/new */}
      <div className="card px-4 py-3 flex flex-wrap items-center gap-3 mb-3">
        <label className="text-3.75 font-semibold text-secondary shrink-0">Form</label>
        <select
          value={selectedForm?.id ?? ''}
          onChange={e => setSelectedForm(forms.find(f => f.id === Number(e.target.value)) ?? undefined)}
          disabled={isLoading || isEditing || isCopyingForm || isOpeningCourseForm}
          className="h-9 px-3 rounded-[9px] bg-surface text-primary text-3.4 font-sans outline-none flex-1 min-w-[200px] max-w-xs"
          style={{ border: '1.5px solid var(--border)' }}
        >
          <option value="" disabled>Select a form…</option>
          {forms.map(f => <option key={f.id} value={f.id}>{f.title}</option>)}
        </select>
        <Btn
          onClick={async () => {
          const openForm = () => {
            if (selectedForm) {
              loadFormFromAPI(selectedForm.id);
              setIsNewForm(false);
            }
          };
          if (isEditing) {
            if (await confirmDialog({ title: 'Discard unsaved changes?', message: 'Discard unsaved changes and open selected form?', confirmLabel: 'Discard', tone: 'danger' })) {
              setIsEditing(false);
              openForm();
            }
          } else {
            openForm();
          }
        }}
          disabled={!selectedForm || isLoading || isEditing || isCopyingForm || isOpeningCourseForm}>
          Open Form
        </Btn>
        <Btn variant="secondary"
          disabled={isEditing || isCopyingForm || isOpeningCourseForm}
          onClick={async () => {
            const startNewForm = () => {
              // Reset table and start a new form
              setSelectedForm(undefined);
              resetTable();
              setIsNewForm(true);
              setIsEditing(true);
            };
            if (isEditing) {
              if (await confirmDialog({ title: 'Discard unsaved changes?', message: 'Discard unsaved changes and start a new form?', confirmLabel: 'Discard', tone: 'danger' })) {
                setIsEditing(false);
                startNewForm();
              }
            } else {
              startNewForm();
            }
          }}>
          New Form
        </Btn>
        <Btn variant="secondary" 
          onClick={() => {
            setCourseName('');
            setIsCopyingForm(true)
            if(selectedForm) loadFormFromAPI(selectedForm.id, true)
            setNewCourseName('')
          }}
          disabled={isEditing || isCopyingForm || selectedForm == null || isOpeningCourseForm}
        >Copy Form</Btn>
      </div>

      { 
      // showTableActions &&
      <div>
        <div className="card px-4 py-3 flex flex-wrap items-center gap-2 mb-3" style={{display:'flex', flexDirection:'column', alignItems:'flex-start'}}>
          <div style={{gap:10, display:'flex', flexDirection:'row', alignItems:'center', width:'100%'}}>
          <label  className="text-3.75 font-semibold text-secondary shrink-0" style={{whiteSpace:'nowrap', width:85}}>
            Form Name            
          </label>
          <input
              className='h-9 px-3 rounded-[9px] bg-surface text-primary text-3.4 font-sans outline-none flex-1 min-w-[200px]'
              type="text"
              maxLength={255}
              value={tableTitle}
              onChange={(e) => { setTableTitle(e.target.value); setIsEditing(true); } }              
              placeholder="Enter form name"
              style={{width:'100%'}}
            />
          </div>
          <div style={{gap:10, display:'flex', flexDirection:'row', alignItems:'center', width:'100%'}}>
            <label  className="text-3.75 font-semibold text-secondary shrink-0" style={{whiteSpace:'nowrap', width:85}}>
              Course Name              
            </label>
              {
              (
              isSelectingCourseName && isCopyingForm
              ?
              <select
                value={newCourseName ?? ''}
                onChange={e => setNewCourseName(courseNames.find(n => n === e.target.value) ?? '')}
                //disabled={isLoading || isEditing}
                className="h-9 px-3 rounded-[9px] bg-surface text-primary text-3.4 font-sans outline-none flex-1 min-w-[200px]"
                style={{ border: '1.5px solid var(--border)', marginLeft:10, maxWidth:374 }}
              >
                <option value="" disabled>Select a course…</option>
                {courseNames.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
              :
              <input
                  className='h-9 px-3 rounded-[9px] bg-surface text-primary text-3.4 font-sans outline-none flex-1 min-w-[200px]'
                  type="text"
                  value={newCourseName}
                  maxLength={255}
                  onChange={(e) => { setNewCourseName(e.target.value); setIsEditing(true); } }              
                  placeholder="Enter course name"
                  style={{maxWidth:384}}
              />            
              )
              }
              { 
              isCopyingForm &&
              <>
              <div style={{opacity:0.5}}>or</div>
              <Btn onClick={() => {
                setIsSelectingCourseName(prev => !prev)
                fetchAvaiableCourse()
                }}>{(isSelectingCourseName ? 'Enter' : 'Select')} Course</Btn>
              </>
              }
          </div>
               
          <div style={{gap:10, display:'flex', flexDirection:'row', alignItems:'top', width:'100%'}}>
            <label className="text-3.75 font-semibold text-secondary shrink-0" style={{whiteSpace:'nowrap', width:85}}>
              Description              
            </label>
            <textarea
                value={tableDescription}
                onChange={(e) => { setTableDescription(e.target.value); setIsEditing(true); } }
                className='h-9 px-3 rounded-[9px] bg-surface text-primary text-3.4 font-sans outline-none flex-1 min-w-[200px]'
                placeholder="Enter description"
                rows={2}
                maxLength={255}
                style={{width:'100%', height:'100%'}}                
              />
            </div>
            
        </div>

      </div>
        // <div className="form-info-section">
        //   <div className="form-info-column">
        //     <label className="form-label" style={{whiteSpace:'nowrap'}}>
        //       Form Name
        //       <input
        //         type="text"
        //         value={tableTitle}
        //         onChange={(e) => { setTableTitle(e.target.value); setIsEditing(true); } }
        //         className="form-input"
        //         placeholder="Enter form name"
        //         style={{width:'100%'}}
        //       />
        //     </label>
        //   </div>
        //   <div className="form-info-column">
        //     <label className="form-label">
        //       Description
        //       <textarea
        //         value={tableDescription}
        //         onChange={(e) => { setTableDescription(e.target.value); setIsEditing(true); } }
        //         className="form-textarea"
        //         placeholder="Enter description"
        //         rows={3}
        //         style={{width:'100%'}}                
        //       />
        //     </label>
        //   </div>
        // </div>
      }

      {/* Table action toolbar */}
      <div className="card px-4 py-3 flex flex-wrap items-center gap-2 mb-3">
        <Btn variant="secondary" size="sm" onClick={addRow}>
          <HiOutlinePlus className="text-[13px]" /> Row
        </Btn>
        <Btn variant="secondary" size="sm" onClick={removeRow} disabled={rowCount <= 1}>
          <HiOutlineMinus className="text-[13px]" /> Row
        </Btn>
        <div className="w-px h-5 bg-bd mx-1" />
        <Btn variant="secondary" size="sm" onClick={addCol}>
          <HiOutlinePlus className="text-[13px]" /> Column
        </Btn>
        <Btn variant="secondary" size="sm" onClick={removeCol} disabled={colCount <= 1}>
          <HiOutlineMinus className="text-[13px]" /> Column
        </Btn>
        <div className="w-px h-5 bg-bd mx-1" />
        <Btn variant="secondary" size="sm" onClick={mergeSelection} disabled={!selection || selection.startCol === selection.endCol}>
          <HiOutlineArrowsPointingOut className="text-[13px]" /> Merge
        </Btn>
        <Btn
          variant="secondary" size="sm" onClick={unmergeSelection}
          disabled={!selection || selection.startCol !== selection.endCol || !isCellMerged(cellData, selection.row, selection.startCol)}
        >
          Unmerge
        </Btn>
        <Btn
          variant="secondary" size="sm" onClick={splitSelection}
          disabled={!selection || selection.startCol !== selection.endCol}
        >
          Split Column
        </Btn>
        <Btn
          variant="secondary" size="sm" onClick={unsplitSelection}
          disabled={
            !selection ||
            selection.startCol !== selection.endCol ||
            !cellData[selection.row]?.[selection.startCol]?.splits ||
            (cellData[selection.row]?.[selection.startCol]?.splits?.length ?? 0) < 2
          }
        >
          Unsplit
        </Btn>
        <div className="flex-1" />
        
        {
        (isEditing || selectedForm != null) &&
        <Btn onClick={saveToJSON} disabled={tableTitle == null || tableTitle.trim().length == 0 || (isCopyingForm && (newCourseName == null || newCourseName.length == 0))}>
          <HiOutlineArrowDownTray className="text-[14px]" />Save
        </Btn>
        }
        {
        !isEditing && selectedForm && !isEditing && tableTitle && (!isCopyingForm) &&
        <Btn onClick={async () => {
          if (await confirmDialog({ title: 'Delete form?', message: 'Are you sure you want to delete this form?', confirmLabel: 'Delete', tone: 'danger' })) {
            //deleteFormApi(isOpeningCourseForm ? selectedCourse.id : selectedForm.id);
            deleteFormApi(selectedForm.id);
          }
        }}>Delete</Btn>
        }
        {
        (isEditing || isCopyingForm) &&
        <Btn onClick={() => {
          setIsEditing(false)
          setIsCopyingForm(false)
          if(isNewForm) {
            resetTable();
            setIsNewForm(true)
          // } else if(isOpeningCourseForm) {
          //   loadFormFromAPI(selectedCourse.id)
          } else if(selectedForm != null) {
            loadFormFromAPI(selectedForm.id)          
          }
        }}>Cancel</Btn>
        }
        {/* {
          isOpeningCourseForm &&
          <Btn onClick={() => {
              setSelectedCourse(null)
              if(selectedForm) {
                loadFormFromAPI(selectedForm.id)    
              }
            }}
          >Close</Btn>
        } */}
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden mb-4">
        <div className="table-scroll-wrapper">
          <table ref={tableRef} className="dynamic-table">
            <thead>
              {cellData[0] && (
                <tr>
                  {Array.from({ length: colCount }, (_, i) => {
                    const mw = getMergedWith(cellData, 0, i)
                    const span = getColSpan(0, i)
                    if (mw || span === 0) return null
                    return (
                      <th key={i} style={{ width: columnWidths[i] }} colSpan={span}>
                        <div className="header-cell-wrapper">
                          <div className={`cell ${selection && selection.row === 0 && i >= Math.min(selection.startCol, selection.endCol) && i <= Math.max(selection.startCol, selection.endCol) ? 'active' : ''}`}
                            onMouseDown={(e) => handleCellMouseDown(e, 0, i)}
                            onMouseOver={() => handleCellMouseOver(0, i)}>
                            {cellData[0]?.[i]?.splits && cellData[0][i].splits!.length > 1 ? (
                              <div style={{ display: 'flex', width: '100%', height: '100%' }}>
                                {cellData[0][i].splits!.map((sv, si) => (
                                  <input
                                    key={si}
                                    type="text"
                                    value={sv}
                                    onChange={e => handleSplitChange(0, i, si, e.target.value)}
                                    placeholder={`Column ${i + 1}.${si + 1}`}
                                    className={`cell-input ${isCellMerged(cellData, 0, i) ? 'merged-input' : ''}`}
                                    style={{ flex: 1, borderLeft: si > 0 ? '1px solid var(--border)' : undefined }}
                                  />
                                ))}
                              </div>
                            ) : (
                              <input
                                type="text"
                                value={cellData[0]?.[i]?.value ?? ''}
                                onChange={e => handleCellChange(0, i, e.target.value)}
                                placeholder={`Column ${i + 1}`}
                                className={`cell-input ${isCellMerged(cellData, 0, i) ? 'merged-input' : ''}`}
                              />
                            )}
                          </div>
                          {span === 1 && (
                            <div className="resize-handle" onMouseDown={(e) => { e.stopPropagation(); handleColumnResizeStart(i)(e) }} title="Drag to resize column" />
                          )}
                        </div>
                      </th>
                    )
                  })}
                </tr>
              )}
            </thead>
            <tbody>
              {Array.from({ length: Math.max(0, rowCount - 1) }, (_, i) => {
                const rowIndex = i + 1
                return (
                  <tr key={rowIndex} style={{ height: rowHeights?.[i] || 'auto' }}>
                    {cellData[rowIndex] && Array.from({ length: colCount }, (_, j) => {
                      const mw   = getMergedWith(cellData, rowIndex, j)
                      const span = getColSpan(rowIndex, j)
                      if (mw || span === 0) return null
                      const cell        = cellData[rowIndex]?.[j] || { value: '' }
                      const inRange = !!(selection && selection.row === rowIndex &&
                        j >= Math.min(selection.startCol, selection.endCol) &&
                        j <= Math.max(selection.startCol, selection.endCol))
                      return (
                        <td
                          key={`${rowIndex}-${j}`}
                          className={`cell data-cell ${inRange ? 'active' : ''}`}
                          colSpan={span}
                          data-merged={isCellMerged(cellData, rowIndex, j) ? 'true' : 'false'}
                          onMouseDown={(e) => handleCellMouseDown(e, rowIndex, j)}
                          onMouseOver={() => handleCellMouseOver(rowIndex, j)}
                        >
                          {j === 0 && span === 1 && (
                            <div
                              className="row-resize-handle"
                              onMouseDown={handleRowResizeStart(i)}
                              title="Drag to resize row"
                            />
                          )}
                          {(() => {
                            const cellHeight = rowHeights?.[i] || 40
                            const taHeight = Math.max(30, cellHeight - 8)
                            const taRows = Math.max(1, Math.floor(cellHeight / 25))
                            return cell.splits && cell.splits.length > 1 ? (
                              <div style={{ display: 'flex', width: '100%', height: `${taHeight}px` }}>
                                {cell.splits.map((sv, si) => (
                                  <textarea
                                    key={si}
                                    ref={el => {
                                      const k = `${rowIndex}-${j}-${si}`
                                      if (el) textareaRefs.current.set(k, el); else textareaRefs.current.delete(k)
                                    }}
                                    value={sv}
                                    onChange={e => handleSplitChange(rowIndex, j, si, e.target.value)}
                                    className={`cell-input ${isCellMerged(cellData, rowIndex, j) ? 'merged-input' : ''}`}
                                    style={{ flex: 1, resize: 'none', overflowY: 'auto', height: `${taHeight}px`, borderLeft: si > 0 ? '1px solid var(--border)' : undefined }}
                                    rows={taRows}
                                  />
                                ))}
                              </div>
                            ) : (
                              <textarea
                                ref={el => { if (el) textareaRefs.current.set(`${rowIndex}-${j}`, el); else textareaRefs.current.delete(`${rowIndex}-${j}`) }}
                                value={cell.value}
                                onChange={e => handleCellChange(rowIndex, j, e.target.value)}
                                className={`cell-input ${isCellMerged(cellData, rowIndex, j) ? 'merged-input' : ''}`}
                                style={{ resize: 'none', overflowY: 'auto', height: `${taHeight}px`, cursor: isCellMerged(cellData, rowIndex, j) ? 'text' : 'default' }}
                                rows={taRows}
                              />
                            )
                          })()}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Instructions */}
      <div className="flex gap-3 px-4 py-[13px] rounded-[11px]" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)' }}>
        <HiOutlineInformationCircle className="text-[18px] shrink-0 mt-px text-[#D97706]" />
        <p className="text-3.75 text-secondary leading-[1.55]">
          <strong className="text-[#D97706]">How to merge cells:</strong> Drag across cells in the same row to select a range (or click the first cell and Shift-click the last), then click <em>Merge</em>. To unmerge, click a single merged cell and then click <em>Unmerge</em>.
        </p>
      </div>

    </div>
  )
}

export default DynamicFormsPage
