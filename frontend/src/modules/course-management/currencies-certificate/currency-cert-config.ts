export const COMPLETION_STATUS = {
  NONE: 0,
  CERTIFICATE_ONLY: 40,
  CURRENCY_ONLY: 60,
  BOTH: 100,
} as const

export function isCurrenciesComplete(completion: number): boolean {
  return completion === COMPLETION_STATUS.CURRENCY_ONLY || completion === COMPLETION_STATUS.BOTH
}

export function isCertificateComplete(completion: number): boolean {
  return completion === COMPLETION_STATUS.CERTIFICATE_ONLY || completion === COMPLETION_STATUS.BOTH
}

export function calculateOverallProgress(completion: number): number {
  if (completion === COMPLETION_STATUS.BOTH) return 100
  if (completion === COMPLETION_STATUS.CURRENCY_ONLY) return 60
  if (completion === COMPLETION_STATUS.CERTIFICATE_ONLY) return 40
  return 0
}

export function getCompletedTabsCount(completion: number): string {
  if (completion === COMPLETION_STATUS.NONE) return '0/2'
  if (completion === COMPLETION_STATUS.CERTIFICATE_ONLY) return '1/2'
  if (completion === COMPLETION_STATUS.CURRENCY_ONLY) return '1/2'
  return '2/2'
}

// ── 3-tab progress (Flight Package + Currencies + Certificate) ───────────────
// Flight package completion is tracked in its own column (0 or 100), separate
// from the currencies/certificate bitmask, so the page composes all three here.

export function isFlightComplete(flightCompletion: number): boolean {
  return flightCompletion >= 100
}

export function isTaskAssociationComplete(completion: number): boolean {
  return completion >= 100
}

export function isFlightPackAssociationComplete(completion: number): boolean {
  return completion >= 100
}

export interface TabsProgress {
  overallProgress: number
  tabsCompleted: string
}

export function computeTabsProgress(
  flightDone: boolean,
  currenciesDone: boolean,
  taskAssocDone: boolean,
  certDone: boolean,
  fpaDone: boolean | undefined,
): TabsProgress {
  const tabs = [flightDone, currenciesDone, taskAssocDone, certDone, ...(fpaDone !== undefined ? [fpaDone] : [])]
  const done = tabs.filter(Boolean).length
  return {
    overallProgress: Math.round((done / tabs.length) * 100),
    tabsCompleted: `${done}/${tabs.length}`,
  }
}
