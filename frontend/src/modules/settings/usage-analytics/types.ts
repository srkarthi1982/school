// Response shapes mirroring backend app/modules/analytics/schemas.py. Replace
// with generated types once `npm run generate-types` is run against a backend
// exposing /api/v1/analytics/*.

export type TrendPoint = { day: string; active_users: number }

export type Overview = {
  registered_total: number
  registered_active: number
  dau: number
  wau: number
  mau: number
  active_in_range: number
  range_days: number
  trend: TrendPoint[]
}

export type ConcurrencyDayPoint = { day: string; avg_concurrent: number; max_concurrent: number }

export type Concurrency = {
  avg_concurrent: number
  max_concurrent: number
  peak_at: string | null
  range_days: number
  series: ConcurrencyDayPoint[]
}

export type UserUsageRow = {
  user_id: number
  username: string | null
  full_name: string | null
  event_count: number
  active_days: number
  login_count: number
}

export type FeatureUsageRow = {
  feature: string
  distinct_users: number
  visits: number
  request_count: number
}

export type TerminalUsageRow = {
  ip: string
  distinct_users: number
  request_count: number
}
