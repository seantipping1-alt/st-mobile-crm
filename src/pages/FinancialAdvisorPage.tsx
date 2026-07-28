import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Car,
  Users,
  MessageSquare,
  AlertTriangle,
  ChevronRight,
  Activity,
  Wrench,
  Cpu,
  Key,
  Search,
  GraduationCap,
  Crosshair,
} from 'lucide-react'

const OWNER_ID = '095969b8-e5da-45a1-a26e-483fac0cc94c'

const ANNUAL_TARGET = 700_000
const MONTHLY_TARGET = Math.round(ANNUAL_TARGET / 12)
const OWNER_TAKE_TARGET = 12_500

const SERVICE_LINES = [
  { key: 'programming', label: 'Programming', icon: Cpu },
  { key: 'diagnostics', label: 'Diagnostics', icon: Search },
  { key: 'adas', label: 'ADAS', icon: Crosshair },
  { key: 'keys', label: 'Keys', icon: Key },
  { key: 'scantool', label: 'Scantool', icon: Wrench },
  { key: 'teaching', label: 'Teaching', icon: GraduationCap },
]

function fmt(n: number | null | undefined, style: 'currency' | 'percent' | 'decimal' = 'currency'): string {
  if (n == null) return '—'
  if (style === 'currency') return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
  if (style === 'percent') return `${(n * 100).toFixed(1)}%`
  return n.toFixed(1)
}

interface MetricSnapshot {
  metric: string
  dimension: string | null
  period: string
  value: number
  partial: boolean
  low_sample: boolean
}

interface FinAlert {
  id?: string
  rule: string
  message: string
  fired_at: string
  acknowledged: boolean
}

// Simple bar indicator component
function BarIndicator({ value, target, label, format = 'currency' }: { value: number | null; target: number; label: string; format?: 'currency' | 'percent' | 'decimal' }) {
  const pct = value != null ? Math.min((value / target) * 100, 100) : 0
  const color = value != null
    ? pct >= 90 ? '#22C55E' : pct >= 60 ? '#F59E0B' : '#EF4444'
    : '#475569'

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-[var(--color-muted)]">{label}</span>
        <span className="text-sm font-semibold">{value != null ? fmt(value, format) : '—'}</span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: '#1E293B' }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-[var(--color-muted)]">
        <span>$0</span>
        <span>Target: {fmt(target, format)}</span>
      </div>
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <Activity size={24} className="text-[var(--color-muted)] mb-2" />
      <p className="text-sm text-[var(--color-muted)]">{message}</p>
    </div>
  )
}

export default function FinancialAdvisorPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [metrics, setMetrics] = useState<MetricSnapshot[]>([])
  const [alerts, setAlerts] = useState<FinAlert[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Auth gate
  useEffect(() => {
    if (user && user.id !== OWNER_ID) {
      navigate('/', { replace: true })
    }
  }, [user, navigate])

  // Load data
  useEffect(() => {
    if (!user || user.id !== OWNER_ID) return

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const [metricsRes, alertsRes] = await Promise.all([
          supabase.from('fin_metric_snapshots').select('*').order('period', { ascending: false }),
          supabase.from('fin_alerts').select('*').eq('acknowledged', false).order('fired_at', { ascending: false }),
        ])

        if (metricsRes.error) throw metricsRes.error
        if (alertsRes.error) throw alertsRes.error

        setMetrics(metricsRes.data || [])
        setAlerts(alertsRes.data || [])
      } catch (err: any) {
        setError(err.message || 'Failed to load financial data')
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [user])

  if (user && user.id !== OWNER_ID) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-[var(--color-muted)]">Access restricted</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-6 h-6 border-2 border-[var(--color-primary)] border-t-transparent rounded-full" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-[var(--color-muted)] mb-4">{error}</p>
          <button onClick={() => window.location.reload()} className="text-[var(--color-primary)] text-sm min-h-[44px]">Try Again</button>
        </div>
      </div>
    )
  }

  // Extract metrics helpers
  const getMetric = (metric: string, dimension?: string): MetricSnapshot | undefined =>
    metrics.find(m => m.metric === metric && (dimension ? m.dimension === dimension : !m.dimension))

  const revenue = getMetric('revenue')
  const netIncome = getMetric('net_income')
  const dollarPerHour = getMetric('dollar_per_hour')
  const driveTimeRatio = getMetric('drive_time_ratio')

  const hasMetrics = metrics.length > 0

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-4 pb-24 md:pb-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <TrendingUp size={20} className="text-[var(--color-primary)]" />
          Financial Advisor
        </h1>
        <p className="text-xs text-[var(--color-muted)] mt-0.5">Owner dashboard · Private</p>
      </div>

      {/* ── Section 1: Pulse ── */}
      <div className="bg-[var(--color-surface)] rounded-xl p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Activity size={16} className="text-[var(--color-primary)]" />
          <h2 className="text-sm font-semibold uppercase tracking-wider">Pulse</h2>
          <span className="text-[10px] text-[var(--color-muted)]">Monthly Health</span>
        </div>

        {!hasMetrics ? (
          <EmptyState message="No data yet — awaiting first sync" />
        ) : (
          <div className="space-y-4">
            <BarIndicator
              value={revenue?.value ?? null}
              target={MONTHLY_TARGET}
              label={`Revenue vs $${(MONTHLY_TARGET / 1000).toFixed(0)}k/mo pace ($${(ANNUAL_TARGET / 1000).toFixed(0)}k annual)`}
            />
            <BarIndicator
              value={netIncome?.value ?? null}
              target={OWNER_TAKE_TARGET}
              label={`Net Income / Owner Take vs $${(OWNER_TAKE_TARGET / 1000).toFixed(1)}k/mo`}
            />

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-[var(--color-bg)] rounded-lg p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <DollarSign size={14} className="text-[var(--color-primary)]" />
                  <span className="text-xs text-[var(--color-muted)]">$/Total Hour</span>
                </div>
                <p className="text-lg font-semibold">
                  {dollarPerHour ? fmt(dollarPerHour.value) : '—'}
                </p>
                {dollarPerHour?.low_sample && (
                  <span className="text-[10px] text-yellow-500">Low sample</span>
                )}
              </div>
              <div className="bg-[var(--color-bg)] rounded-lg p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <Car size={14} className="text-[var(--color-primary)]" />
                  <span className="text-xs text-[var(--color-muted)]">Drive-Time Ratio</span>
                </div>
                <p className="text-lg font-semibold">
                  {driveTimeRatio ? fmt(driveTimeRatio.value, 'percent') : '—'}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Section 2: Service Lines ── */}
      <div className="bg-[var(--color-surface)] rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Wrench size={16} className="text-[var(--color-primary)]" />
          <h2 className="text-sm font-semibold uppercase tracking-wider">Service Lines</h2>
        </div>

        {!hasMetrics ? (
          <EmptyState message="No data yet — awaiting first sync" />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {SERVICE_LINES.map(({ key, label, icon: Icon }) => {
              const rev = getMetric('revenue', key)
              const hrs = getMetric('hours', key)
              const dph = getMetric('dollar_per_hour', key)
              const margin = getMetric('contribution_margin', key)
              const hasData = rev || hrs || dph || margin

              return (
                <div key={key} className="bg-[var(--color-bg)] rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Icon size={14} className="text-[var(--color-primary)]" />
                      <span className="text-sm font-medium">{label}</span>
                    </div>
                    {/* Placeholder trend arrow */}
                    <span className="text-[var(--color-muted)]">
                      <ChevronRight size={14} />
                    </span>
                  </div>

                  {hasData ? (
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                      <div>
                        <span className="text-[var(--color-muted)]">Revenue</span>
                        <p className={`font-semibold ${rev?.partial ? 'text-yellow-400 italic' : ''}`}>
                          {rev ? fmt(rev.value) : '—'}
                          {rev?.partial && <span className="text-[9px] ml-1">est</span>}
                        </p>
                      </div>
                      <div>
                        <span className="text-[var(--color-muted)]">Hours</span>
                        <p className={`font-semibold ${hrs?.partial ? 'text-yellow-400 italic' : ''}`}>
                          {hrs ? fmt(hrs.value, 'decimal') : '—'}
                          {hrs?.partial && <span className="text-[9px] ml-1">est</span>}
                        </p>
                      </div>
                      <div>
                        <span className="text-[var(--color-muted)]">$/hr</span>
                        <p className="font-semibold">{dph ? fmt(dph.value) : '—'}</p>
                      </div>
                      <div>
                        <span className="text-[var(--color-muted)]">Margin</span>
                        <p className="font-semibold">{margin ? fmt(margin.value, 'percent') : '—'}</p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-[var(--color-muted)]">No data yet</p>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Section 3: Customers ── */}
      <div className="bg-[var(--color-surface)] rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Users size={16} className="text-[var(--color-primary)]" />
          <h2 className="text-sm font-semibold uppercase tracking-wider">Top Customers</h2>
        </div>

        {(() => {
          const customerMetrics = metrics.filter(m => m.metric === 'customer_revenue')
          if (customerMetrics.length === 0) {
            return <EmptyState message="No customer data yet — awaiting first sync" />
          }

          const sorted = [...customerMetrics].sort((a, b) => b.value - a.value).slice(0, 10)

          return (
            <div className="space-y-4">
              {/* Top 10 */}
              <div className="space-y-1">
                {sorted.map((c, i) => {
                  const rate = getMetric('customer_hourly_rate', c.dimension ?? undefined)
                  const dtp = getMetric('customer_days_to_pay', c.dimension ?? undefined)
                  return (
                    <div key={c.dimension || i} className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0 min-h-[44px]">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-[var(--color-muted)] w-5">{i + 1}</span>
                        <span className="text-sm font-medium truncate max-w-[140px]">{c.dimension || 'Unknown'}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs">
                        <span className="font-semibold">{fmt(c.value)}</span>
                        {rate && <span className="text-[var(--color-muted)]">{fmt(rate.value)}/hr</span>}
                        {dtp && <span className="text-[var(--color-muted)]">{fmt(dtp.value, 'decimal')}d pay</span>}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Rising / Falling placeholders */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[var(--color-bg)] rounded-lg p-3">
                  <div className="flex items-center gap-1.5 mb-2">
                    <TrendingUp size={14} className="text-green-400" />
                    <span className="text-xs font-medium text-green-400">Rising</span>
                  </div>
                  <p className="text-xs text-[var(--color-muted)]">Trend data coming soon</p>
                </div>
                <div className="bg-[var(--color-bg)] rounded-lg p-3">
                  <div className="flex items-center gap-1.5 mb-2">
                    <TrendingDown size={14} className="text-red-400" />
                    <span className="text-xs font-medium text-red-400">Falling</span>
                  </div>
                  <p className="text-xs text-[var(--color-muted)]">Trend data coming soon</p>
                </div>
              </div>
            </div>
          )
        })()}
      </div>

      {/* ── Section 4: Advisor ── */}
      <div className="bg-[var(--color-surface)] rounded-xl p-4 space-y-4">
        <div className="flex items-center gap-2">
          <MessageSquare size={16} className="text-[var(--color-primary)]" />
          <h2 className="text-sm font-semibold uppercase tracking-wider">Advisor</h2>
          <span className="text-[10px] text-[var(--color-muted)]">Ledger</span>
        </div>

        {/* Weekly Analysis */}
        <div className="bg-[var(--color-bg)] rounded-lg p-4">
          <p className="text-xs text-[var(--color-muted)] uppercase tracking-wider mb-2">Weekly Analysis</p>
          {(() => {
            const analysis = getMetric('weekly_analysis')
            if (analysis) {
              return <p className="text-sm leading-relaxed">{analysis.dimension || 'Analysis available'}</p>
            }
            return (
              <div className="flex flex-col items-center py-4 text-center">
                <MessageSquare size={20} className="text-[var(--color-muted)] mb-2" />
                <p className="text-sm text-[var(--color-muted)]">Weekly analysis will appear here after first data sync</p>
              </div>
            )
          })()}
        </div>

        {/* Alerts */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={14} className="text-yellow-500" />
            <span className="text-xs font-medium">Open Alerts</span>
            {alerts.length > 0 && (
              <span className="text-[10px] bg-yellow-500/20 text-yellow-500 px-1.5 py-0.5 rounded-full">{alerts.length}</span>
            )}
          </div>

          {alerts.length === 0 ? (
            <p className="text-xs text-[var(--color-muted)] pl-5">No open alerts</p>
          ) : (
            <div className="space-y-2">
              {alerts.map((alert, i) => (
                <div key={alert.id || i} className="bg-[var(--color-bg)] rounded-lg p-3 min-h-[44px] flex items-start gap-2">
                  <AlertTriangle size={14} className="text-yellow-500 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-yellow-500">{alert.rule}</p>
                    <p className="text-xs text-[var(--color-muted)] mt-0.5">{alert.message}</p>
                    <p className="text-[10px] text-[var(--color-muted)] mt-1">
                      {new Date(alert.fired_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
