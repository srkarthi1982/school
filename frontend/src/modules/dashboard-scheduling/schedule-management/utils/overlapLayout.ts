import type { ScheduleEntry } from '../types'

export type ResizeEdge = 'top' | 'bottom'

export const MIN_DURATION_MS = 15 * 60 * 1000

/**
 * Clamp a proposed resize so the entry does not collide with non-overlapping
 * neighbours and stays within the day.
 */
export function clampResize(
  entry: ScheduleEntry,
  edge: ResizeEdge,
  proposedTimeMs: number,
  siblings: ScheduleEntry[],
): number {
  const startMs = new Date(entry.startAt).getTime()
  const endMs   = new Date(entry.endAt).getTime()

  if (edge === 'top') {
    const dayStart = new Date(entry.startAt)
    dayStart.setHours(0, 0, 0, 0)
    let floor = dayStart.getTime()
    for (const s of siblings) {
      const sEnd = new Date(s.endAt).getTime()
      if (sEnd <= startMs && sEnd > floor) floor = sEnd
    }
    const ceiling = endMs - MIN_DURATION_MS
    return Math.max(floor, Math.min(ceiling, proposedTimeMs))
  } else {
    const dayEnd = new Date(entry.endAt)
    dayEnd.setHours(0, 0, 0, 0)
    dayEnd.setDate(dayEnd.getDate() + 1)
    let ceiling = dayEnd.getTime()
    for (const s of siblings) {
      const sStart = new Date(s.startAt).getTime()
      if (sStart >= endMs && sStart < ceiling) ceiling = sStart
    }
    const floor = startMs + MIN_DURATION_MS
    return Math.max(floor, Math.min(ceiling, proposedTimeMs))
  }
}

export interface ScheduleEntryOnDay {
  entry: ScheduleEntry
  segmentStartMs: number
  segmentEndMs: number
  isHead: boolean
  isTail: boolean
}

export interface LaidOutScheduleEntryOnDay extends ScheduleEntryOnDay {
  col: number
  count: number
}

export interface ClusterOverflow {
  clusterId: number
  hidden: ScheduleEntryOnDay[]
  startMs: number
  endMs: number
}

export interface DayLayout {
  visible: LaidOutScheduleEntryOnDay[]
  overflow: ClusterOverflow[]
}

const MAX_VISIBLE_COLS = 3

export function computeDayLayout(items: ScheduleEntryOnDay[]): DayLayout {
  if (items.length === 0) return { visible: [], overflow: [] }

  const sorted = [...items].sort((a, b) => a.segmentStartMs - b.segmentStartMs)

  const clusters: ScheduleEntryOnDay[][] = []
  let current: ScheduleEntryOnDay[] = []
  let currentEnd = -Infinity

  for (const item of sorted) {
    if (current.length === 0 || item.segmentStartMs < currentEnd) {
      current.push(item)
      currentEnd = Math.max(currentEnd, item.segmentEndMs)
    } else {
      clusters.push(current)
      current = [item]
      currentEnd = item.segmentEndMs
    }
  }
  if (current.length) clusters.push(current)

  const visible: LaidOutScheduleEntryOnDay[] = []
  const overflow: ClusterOverflow[] = []

  clusters.forEach((cluster, clusterId) => {
    const columns: ScheduleEntryOnDay[][] = []
    const colMap = new Map<number, number>()

    for (const item of cluster) {
      let placed = false
      for (let i = 0; i < columns.length; i++) {
        const col = columns[i]
        const last = col[col.length - 1]
        if (last.segmentEndMs <= item.segmentStartMs) {
          col.push(item)
          colMap.set(item.entry.id, i)
          placed = true
          break
        }
      }
      if (!placed) {
        columns.push([item])
        colMap.set(item.entry.id, columns.length - 1)
      }
    }

    const totalCols = columns.length

    if (totalCols <= MAX_VISIBLE_COLS) {
      cluster.forEach(item => {
        visible.push({
          ...item,
          col: colMap.get(item.entry.id)!,
          count: totalCols,
        })
      })
    } else {
      const hidden: ScheduleEntryOnDay[] = []
      const clusterStart = Math.min(...cluster.map(i => i.segmentStartMs))
      const clusterEnd   = Math.max(...cluster.map(i => i.segmentEndMs))
      cluster.forEach(item => {
        const col = colMap.get(item.entry.id)!
        if (col < 2) {
          visible.push({ ...item, col, count: MAX_VISIBLE_COLS })
        } else {
          hidden.push(item)
        }
      })
      overflow.push({ clusterId, hidden, startMs: clusterStart, endMs: clusterEnd })
    }
  })

  return { visible, overflow }
}
