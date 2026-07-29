import { useEffect, useState, type ReactNode } from 'react'
import SectionHeader from '../../../infra/shared/components/SectionHeader'
import {
  fetchConcurrency,
  fetchFeatures,
  fetchOverview,
  fetchTerminals,
  fetchUsers,
} from './api'
import { AreaChart, BarChart, InlineBar, StatTile } from './charts'
import type {
  Concurrency,
  FeatureUsageRow,
  Overview,
  TerminalUsageRow,
  UserUsageRow,
} from './types'

const RANGES = [7, 30, 90]

function shortDay(iso: string): string {
  const d = new Date(iso)
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function Card({ title, children, subtitle }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="card p-4 flex flex-col gap-3 min-w-0">
      <div className="flex flex-col gap-0.5">
        <h3 className="text-sm font-bold text-primary">{title}</h3>
        {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}

const thClass = 'px-3 py-2 text-start text-[11px] font-bold text-white/60 uppercase tracking-[0.06em]'
const tdClass = 'px-3 py-2 text-sm text-secondary'

export default function UsageAnalyticsPage() {
  const [days, setDays] = useState(30)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [overview, setOverview] = useState<Overview | null>(null)
  const [concurrency, setConcurrency] = useState<Concurrency | null>(null)
  const [users, setUsers] = useState<UserUsageRow[]>([])
  const [features, setFeatures] = useState<FeatureUsageRow[]>([])
  const [terminals, setTerminals] = useState<TerminalUsageRow[]>([])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const [ov, cc, us, fe, te] = await Promise.all([
          fetchOverview(days),
          fetchConcurrency(days),
          fetchUsers(days),
          fetchFeatures(days),
          fetchTerminals(days),
        ])
        if (cancelled) return
        setOverview(ov)
        setConcurrency(cc)
        setUsers(us.users)
        setFeatures(fe.features)
        setTerminals(te.terminals)
      } catch (e) {
        if (!cancelled) setError('Failed to load analytics. Ensure you have the analytics:read permission and the backend is running.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [days])

  const featureMax = features.length ? Math.max(...features.map((f) => f.distinct_users)) : 0

  return (
    <div className="flex flex-col gap-5 overflow-auto h-full">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionHeader eyebrow="Monitoring" title="Usage Analytics" />
        <div className="flex items-center gap-1 bg-surface-2 rounded-lg p-1 border border-bd">
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setDays(r)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer border-none font-sans ${
                days === r ? 'bg-accent text-white' : 'bg-transparent text-secondary hover:text-primary'
              }`}
            >
              {r}d
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="card p-4 text-sm text-red-500 border border-red-500/30">{error}</div>
      )}
      {loading && !overview && <div className="text-sm text-muted">Loading…</div>}

      {/* KPI tiles */}
      {overview && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatTile label="Registered" value={overview.registered_total} sub={`${overview.registered_active} active`} />
          <StatTile label={`Active · ${days}d`} value={overview.active_in_range} />
          <StatTile label="DAU" value={overview.dau} sub="last 24h" />
          <StatTile label="WAU" value={overview.wau} sub="last 7d" />
          <StatTile label="MAU" value={overview.mau} sub="last 30d" />
          <StatTile
            label="Peak concurrent"
            value={concurrency?.max_concurrent ?? '—'}
            sub={concurrency?.avg_concurrent != null ? `avg ${concurrency.avg_concurrent}` : undefined}
          />
        </div>
      )}

      {/* Trend + concurrency */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {overview && (
          <Card title="Active users" subtitle="Distinct users per day">
            <AreaChart points={overview.trend.map((p) => ({ label: shortDay(p.day), value: p.active_users }))} />
          </Card>
        )}
        {concurrency && (
          <Card
            title="Concurrent users"
            subtitle={`Max per day · peak ${concurrency.max_concurrent}${
              concurrency.peak_at ? ' at ' + new Date(concurrency.peak_at).toLocaleString() : ''
            }`}
          >
            <BarChart points={concurrency.series.map((p) => ({ label: shortDay(p.day), value: p.max_concurrent }))} />
          </Card>
        )}
      </div>

      {/* Features */}
      <Card title="Feature usage" subtitle="Ranked by reach (distinct users). Zero-usage features included.">
        <div className="overflow-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr style={{ background: 'var(--navy)' }}>
                <th className={thClass}>#</th>
                <th className={thClass}>Feature</th>
                <th className={`${thClass} w-[40%]`}>Distinct users</th>
                <th className={thClass}>Visits</th>
                <th className={thClass}>Requests</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-bd">
              {features.map((f, i) => (
                <tr key={f.feature} className="hover:bg-surface-2 transition-colors">
                  <td className={`${tdClass} text-muted`}>{i + 1}</td>
                  <td className="px-3 py-2 text-sm font-semibold text-primary whitespace-nowrap">{f.feature}</td>
                  <td className="px-3 py-2"><InlineBar value={f.distinct_users} max={featureMax} /></td>
                  <td className={`${tdClass} tabular-nums`}>{f.visits}</td>
                  <td className={`${tdClass} tabular-nums`}>{f.request_count}</td>
                </tr>
              ))}
              {!loading && features.length === 0 && (
                <tr><td colSpan={5} className="px-3 py-6 text-center text-sm text-muted">No feature usage yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Users + terminals */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Most active users" subtitle="By activity volume">
          <div className="overflow-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr style={{ background: 'var(--navy)' }}>
                  <th className={thClass}>#</th>
                  <th className={thClass}>User</th>
                  <th className={thClass}>Events</th>
                  <th className={thClass}>Active days</th>
                  <th className={thClass}>Logins</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-bd">
                {users.map((u, i) => (
                  <tr key={u.user_id} className="hover:bg-surface-2 transition-colors">
                    <td className={`${tdClass} text-muted`}>{i + 1}</td>
                    <td className="px-3 py-2 text-sm font-semibold text-primary whitespace-nowrap">
                      {u.full_name || u.username || `User ${u.user_id}`}
                    </td>
                    <td className={`${tdClass} tabular-nums`}>{u.event_count}</td>
                    <td className={`${tdClass} tabular-nums`}>{u.active_days}</td>
                    <td className={`${tdClass} tabular-nums`}>{u.login_count}</td>
                  </tr>
                ))}
                {!loading && users.length === 0 && (
                  <tr><td colSpan={5} className="px-3 py-6 text-center text-sm text-muted">No user activity yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Usage by terminal" subtitle="Client IP / network location">
          <div className="overflow-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr style={{ background: 'var(--navy)' }}>
                  <th className={thClass}>#</th>
                  <th className={thClass}>IP address</th>
                  <th className={thClass}>Distinct users</th>
                  <th className={thClass}>Requests</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-bd">
                {terminals.map((trm, i) => (
                  <tr key={trm.ip} className="hover:bg-surface-2 transition-colors">
                    <td className={`${tdClass} text-muted`}>{i + 1}</td>
                    <td className="px-3 py-2 text-sm font-mono text-primary whitespace-nowrap">{trm.ip}</td>
                    <td className={`${tdClass} tabular-nums`}>{trm.distinct_users}</td>
                    <td className={`${tdClass} tabular-nums`}>{trm.request_count}</td>
                  </tr>
                ))}
                {!loading && terminals.length === 0 && (
                  <tr><td colSpan={4} className="px-3 py-6 text-center text-sm text-muted">No terminal data yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  )
}
