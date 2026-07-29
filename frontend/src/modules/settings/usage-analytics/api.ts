import { client } from '../../../api/generated/client.gen'
import type {
  Concurrency,
  FeatureUsageRow,
  Overview,
  TerminalUsageRow,
  UserUsageRow,
} from './types'

// The backend wraps payloads in { success, data, meta }. Unwrap `.data.data`.
async function get<T>(url: string, query: Record<string, unknown>): Promise<T> {
  const { data } = await client.get({ url, query })
  return (data as { data: T }).data
}

export const fetchOverview = (days: number) =>
  get<Overview>('/api/v1/analytics/overview', { days })

export const fetchConcurrency = (days: number) =>
  get<Concurrency>('/api/v1/analytics/concurrency', { days })

export const fetchUsers = (days: number, limit = 20) =>
  get<{ range_days: number; users: UserUsageRow[] }>('/api/v1/analytics/users', { days, limit })

export const fetchFeatures = (days: number) =>
  get<{ range_days: number; features: FeatureUsageRow[] }>('/api/v1/analytics/features', { days })

export const fetchTerminals = (days: number, limit = 20) =>
  get<{ range_days: number; terminals: TerminalUsageRow[] }>('/api/v1/analytics/terminals', { days, limit })
