export const PIXELS_PER_HOUR = 56
export const SNAP_MINUTES = 15
export const PIXELS_PER_MINUTE = PIXELS_PER_HOUR / 60

export function pixelsToMinutes(px: number): number {
  return px / PIXELS_PER_MINUTE
}

export function minutesToPixels(min: number): number {
  return min * PIXELS_PER_MINUTE
}

export function snapMinutes(min: number, snap = SNAP_MINUTES): number {
  return Math.round(min / snap) * snap
}
