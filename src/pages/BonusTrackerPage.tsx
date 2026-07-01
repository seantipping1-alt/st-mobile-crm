import { useState, useEffect } from 'react'
import { TrendingUp, TrendingDown, Target, Calendar, RefreshCw } from 'lucide-react'

const FLOOR = 14000
const TOP = 20000
const MIN_RATE = 0.02
const MAX_RATE = 0.04

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount)
}

function getBonusRate(profit: number): number {
  if (profit >= TOP) return MAX_RATE
  if (profit >= FLOOR) return MIN_RATE + (MAX_RATE - MIN_RATE) * ((profit - FLOOR) / (TOP - FLOOR))
  return 0
}

function getZoneLabel(profit: number): string {
  if (profit >= TOP) return 'Max Rate'
  if (profit >= FLOOR) return 'On the Scale'
  return 'No Bonus'
}

function getZoneColor(profit: number): string {
  if (profit >= TOP) return '#22C55E'
  if (profit >= FLOOR) return '#F59E0B'
  return '#64748B'
}

interface Snapshot {
  month: string
  snapshot_date: string
  revenue: number
  expenses: number
  profit: number
  bonus_rate: number
  days_elapsed: number
  days_in_month: number
}

export default function BonusTrackerPage() {
  const [data, setData] = useState<{ months: Snapshot[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function loadData() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/bonus-data')
      if (!res.ok) throw new Error('Failed to load bonus data')
      const d = await res.json()
      setData(d)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function refreshFromQB() {
    setRefreshing(true)
    setError(null)
    try {
      const res = await fetch('/api/bonus-refresh', { method: 'POST' })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: 'Refresh failed' }))
        throw new Error(errData.error || 'Refresh failed')
      }
      const d = await res.json()
      setData(d)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setRefreshing(false)
    }
  }

  useEffect(() => { loadData() }, [])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-6 h-6 border-2 border-[var(--color-primary)] border-t-transparent rounded-full" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-[var(--color-muted)] mb-4">{error || 'No data available'}</p>
          <button onClick={loadData} className="text-[var(--color-primary)] text-sm">Try Again</button>
        </div>
      </div>
    )
  }

  const current = data.months[0]
  const pastMonths = data.months.slice(1)

  if (!current) {
    return (
      <div className="p-4 md:p-6 max-w-2xl mx-auto">
        <h1 className="text-xl font-bold mb-4">Bonus Tracker</h1>
        <p className="text-[var(--color-muted)]">No bonus data yet. Data syncs daily at 6 AM.</p>
      </div>
    )
  }

  const profit = current.profit
  const rate = getBonusRate(profit)
  const zoneLabel = getZoneLabel(profit)
  const zoneColor = getZoneColor(profit)

  // Projection based on pace
  const paceMultiplier = current.days_elapsed > 0 ? current.days_in_month / current.days_elapsed : 1
  const projectedRevenue = current.revenue * paceMultiplier
  const projectedExpenses = current.expenses * paceMultiplier
  const projectedProfit = projectedRevenue - projectedExpenses
  const projectedRate = getBonusRate(projectedProfit)
  const projectedZoneLabel = getZoneLabel(projectedProfit)
  const projectedZoneColor = getZoneColor(projectedProfit)

  // Progress bar: 0 to TOP, clamped
  const progressPct = Math.min(Math.max(profit / TOP, 0), 1) * 100
  const floorPct = (FLOOR / TOP) * 100

  // Month label
  const [yr, mo] = current.month.split('-')
  const monthLabel = `${MONTH_NAMES[parseInt(mo) - 1]} ${yr}`

  // Revenue needed to hit floor (assuming expenses stay same)
  const revenueToFloor = Math.max(0, FLOOR - profit)
  const revenueToTop = Math.max(0, TOP - profit)

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Bonus Tracker</h1>
          <p className="text-xs text-[var(--color-muted)]">{monthLabel} · Updated {current.snapshot_date}</p>
        </div>
        <button
          onClick={refreshFromQB}
          disabled={refreshing}
          className="p-2 text-[var(--color-muted)] hover:text-white transition disabled:opacity-50"
          title="Pull latest numbers from QuickBooks"
        >
          <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Current Status Card */}
      <div className="bg-[var(--color-surface)] rounded-xl p-4 space-y-4">
        {/* Profit & Rate */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-[var(--color-muted)] uppercase tracking-wider">Current Profit</p>
            <p className="text-2xl font-bold">{formatCurrency(profit)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-[var(--color-muted)] uppercase tracking-wider">Bonus Rate</p>
            <p className="text-2xl font-bold" style={{ color: zoneColor }}>
              {rate > 0 ? `${(rate * 100).toFixed(1)}%` : '—'}
            </p>
          </div>
        </div>

        {/* Status badge */}
        <div className="flex items-center gap-2">
          <span className="text-xs px-2 py-1 rounded-full font-medium" style={{ background: `${zoneColor}20`, color: zoneColor }}>
            {zoneLabel}
          </span>
          {profit < FLOOR && (
            <span className="text-xs text-[var(--color-muted)]">
              {formatCurrency(revenueToFloor)} more profit to start bonus
            </span>
          )}
          {profit >= FLOOR && profit < TOP && (
            <span className="text-xs text-[var(--color-muted)]">
              {formatCurrency(revenueToTop)} more profit to hit max rate
            </span>
          )}
        </div>

        {/* Progress Bar */}
        <div className="space-y-1">
          <div className="relative h-4 rounded-full overflow-hidden" style={{ background: '#1E293B' }}>
            {/* Floor marker */}
            <div className="absolute top-0 bottom-0 w-px" style={{ left: `${floorPct}%`, background: '#475569', zIndex: 2 }} />
            {/* Fill */}
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${progressPct}%`,
                background: profit >= TOP
                  ? 'linear-gradient(90deg, #F59E0B, #22C55E)'
                  : profit >= FLOOR
                    ? 'linear-gradient(90deg, #F59E0B, #EAB308)'
                    : '#64748B',
              }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-[var(--color-muted)]">
            <span>$0</span>
            <span style={{ marginLeft: `${floorPct - 10}%` }}>$14k (2%)</span>
            <span>$20k (4%)</span>
          </div>
        </div>

        {/* Revenue & Expenses */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-[var(--color-bg)] rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <TrendingUp size={14} className="text-green-400" />
              <span className="text-xs text-[var(--color-muted)]">Revenue</span>
            </div>
            <p className="text-lg font-semibold text-green-400">{formatCurrency(current.revenue)}</p>
          </div>
          <div className="bg-[var(--color-bg)] rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <TrendingDown size={14} className="text-red-400" />
              <span className="text-xs text-[var(--color-muted)]">Expenses</span>
            </div>
            <p className="text-lg font-semibold text-red-400">{formatCurrency(current.expenses)}</p>
          </div>
        </div>
      </div>

      {/* Projection Card */}
      {current.days_elapsed < current.days_in_month && (
        <div className="bg-[var(--color-surface)] rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Target size={16} className="text-[var(--color-primary)]" />
            <p className="text-sm font-medium">Month-End Projection</p>
            <span className="text-xs text-[var(--color-muted)]">({current.days_elapsed} of {current.days_in_month} days)</span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <p className="text-xs text-[var(--color-muted)]">Projected Profit</p>
              <p className="text-lg font-semibold">{formatCurrency(projectedProfit)}</p>
            </div>
            <div>
              <p className="text-xs text-[var(--color-muted)]">Projected Rate</p>
              <p className="text-lg font-semibold" style={{ color: projectedZoneColor }}>
                {projectedRate > 0 ? `${(projectedRate * 100).toFixed(1)}%` : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-[var(--color-muted)]">Status</p>
              <p className="text-sm font-medium mt-1" style={{ color: projectedZoneColor }}>{projectedZoneLabel}</p>
            </div>
          </div>
        </div>
      )}

      {/* How It Works */}
      <div className="bg-[var(--color-surface)] rounded-xl p-4">
        <p className="text-sm font-medium mb-2">How It Works</p>
        <p className="text-xs text-[var(--color-muted)] leading-relaxed">
          Each month rides on company profit. Bonus kicks in at $14,000 profit (2% of your salary)
          and climbs to 4% at $20,000+. Below $14,000, no bonus that month. Calculated at month-end,
          paid the following month. Multiply the rate by your salary for your number.
        </p>
      </div>

      {/* Past Months */}
      {pastMonths.length > 0 && (
        <div className="bg-[var(--color-surface)] rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Calendar size={16} className="text-[var(--color-muted)]" />
            <p className="text-sm font-medium">Past Months</p>
          </div>
          <div className="space-y-2">
            {pastMonths.map((m) => {
              const [y, mo2] = m.month.split('-')
              const mLabel = `${MONTH_NAMES[parseInt(mo2) - 1]} ${y}`
              const mRate = getBonusRate(m.profit)
              const mColor = getZoneColor(m.profit)
              const mZone = getZoneLabel(m.profit)
              return (
                <div key={m.month} className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium w-16">{mLabel}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: `${mColor}20`, color: mColor }}>
                      {mZone}
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-xs text-[var(--color-muted)]">{formatCurrency(m.profit)} profit</span>
                    <span className="text-sm font-semibold w-12 text-right" style={{ color: mColor }}>
                      {mRate > 0 ? `${(mRate * 100).toFixed(1)}%` : '—'}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
