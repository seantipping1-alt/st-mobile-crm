import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import {
  TrendingUp,
  DollarSign,
  Users,
  MessageSquare,
  AlertTriangle,
  Activity,
  Wrench,
  Cpu,
  Key,
  Search,
  GraduationCap,
  Crosshair,
  Calendar,
  Clock,
} from 'lucide-react'

const OWNER_ID = '095969b8-e5da-45a1-a26e-483fac0cc94c'

const ANNUAL_TARGET = 700_000
const MONTHLY_TARGET = Math.round(ANNUAL_TARGET / 12)
// const OWNER_TAKE_TARGET = 12_500

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

function fmtK(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(0)}k`
  return `$${n.toFixed(0)}`
}

interface FinAlert {
  id?: string
  rule: string
  message: string
  fired_at: string
  acknowledged: boolean
}

// Invoice data types (used by pagination helpers)
// interface InvoiceRow { qb_invoice_id: string; customer_name: string; tech_name: string; invoice_date: string; total: number; balance: number; paid_date: string | null }
// interface InvoiceLine { service_line: string; amount: number; fin_invoice_id: string }

// Simple bar indicator
function BarIndicator({ value, target, label, color }: { value: number | null; target: number; label: string; color?: string }) {
  const pct = value != null ? Math.min((value / target) * 100, 100) : 0
  const barColor = color || (value != null
    ? pct >= 90 ? '#22C55E' : pct >= 60 ? '#F59E0B' : '#EF4444'
    : '#475569')

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-[var(--color-muted)]">{label}</span>
        <span className="text-sm font-semibold">{value != null ? fmt(value) : '—'} <span className="text-[10px] text-[var(--color-muted)] font-normal">/ {fmtK(target)}</span></span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: '#1E293B' }}>
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: barColor }} />
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

function StatBox({ icon: Icon, label, value, sub }: { icon: any; label: string; value: string; sub?: string }) {
  return (
    <div className="bg-[var(--color-bg)] rounded-lg p-3">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon size={14} className="text-[var(--color-primary)]" />
        <span className="text-xs text-[var(--color-muted)]">{label}</span>
      </div>
      <p className="text-lg font-semibold">{value}</p>
      {sub && <span className="text-[10px] text-[var(--color-muted)]">{sub}</span>}
    </div>
  )
}

export default function FinancialAdvisorPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [alerts, setAlerts] = useState<FinAlert[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Data state
  const [currentMonthRevenue, setCurrentMonthRevenue] = useState<number>(0)
  const [currentMonthInvoices, setCurrentMonthInvoices] = useState<number>(0)
  const [ytdRevenue, setYtdRevenue] = useState<number>(0)
  const [monthlyRevenues, setMonthlyRevenues] = useState<{ month: string; revenue: number }[]>([])
  const [serviceLineData, setServiceLineData] = useState<Record<string, { revenue: number; count: number; currentMonth: number; currentWeek: number }>>({})
  const [techData, setTechData] = useState<{ name: string; revenue: number; count: number; currentMonth: number; currentWeek: number }[]>([])
  const [techPeriod, setTechPeriod] = useState<'monthly' | 'weekly'>('monthly')
  const [svcPeriod, setSvcPeriod] = useState<'monthly' | 'weekly'>('monthly')
  const [custPeriod, setCustPeriod] = useState<'monthly' | 'weekly'>('monthly')
  const [customerData, setCustomerData] = useState<{ name: string; revenue: number; count: number; avgDaysToPay: number | null; currentMonth: number; currentWeek: number }[]>([])
  const [daysInMonth, setDaysInMonth] = useState(0)
  const [dayOfMonth, setDayOfMonth] = useState(0)

  // Auth gate
  useEffect(() => {
    if (user && user.id !== OWNER_ID) navigate('/', { replace: true })
  }, [user, navigate])

  // Load data
  useEffect(() => {
    if (!user || user.id !== OWNER_ID) return

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const now = new Date()
        const year = now.getFullYear()
        const month = now.getMonth() // 0-indexed
        const monthStart = `${year}-${String(month + 1).padStart(2, '0')}-01`
        const lastDay = new Date(year, month + 1, 0).getDate()
        const monthEnd = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
        const yearStart = `${year}-01-01`
        const today = now.getDate()

        setDaysInMonth(lastDay)
        setDayOfMonth(today)

        // Fetch all invoices with pagination (Supabase default limit is 1000)
        async function fetchAllInvoices() {
          const all: any[] = []
          let from = 0
          const pageSize = 1000
          while (true) {
            const { data, error } = await supabase
              .from('fin_invoices')
              .select('qb_invoice_id,customer_name,tech_name,invoice_date,total,balance,paid_date')
              .gte('invoice_date', yearStart)
              .order('invoice_date', { ascending: true })
              .range(from, from + pageSize - 1)
            if (error) throw error
            all.push(...(data || []))
            if (!data || data.length < pageSize) break
            from += pageSize
          }
          return all
        }

        async function fetchAllLines() {
          const all: any[] = []
          let from = 0
          const pageSize = 1000
          while (true) {
            const { data, error } = await supabase
              .from('fin_invoice_lines')
              .select('service_line,amount,fin_invoice_id')
              .range(from, from + pageSize - 1)
            if (error) throw error
            all.push(...(data || []))
            if (!data || data.length < pageSize) break
            from += pageSize
          }
          return all
        }

        // Fetch all data in parallel
        const [invoices, lines, alertsRes] = await Promise.all([
          fetchAllInvoices(),
          fetchAllLines(),
          supabase.from('fin_alerts').select('*').eq('acknowledged', false).order('fired_at', { ascending: false }),
        ])

        if (alertsRes.error) throw alertsRes.error
        setAlerts(alertsRes.data || [])

        // Current month revenue
        const currentInvoices = invoices.filter(i => i.invoice_date >= monthStart && i.invoice_date <= monthEnd)
        const cmRevenue = currentInvoices.reduce((sum, i) => sum + (i.total || 0), 0)
        setCurrentMonthRevenue(cmRevenue)
        setCurrentMonthInvoices(currentInvoices.length)

        // YTD revenue
        const ytd = invoices.reduce((sum, i) => sum + (i.total || 0), 0)
        setYtdRevenue(ytd)

        // Monthly breakdown
        const monthMap: Record<string, number> = {}
        for (const inv of invoices) {
          const m = inv.invoice_date.substring(0, 7) // YYYY-MM
          monthMap[m] = (monthMap[m] || 0) + (inv.total || 0)
        }
        setMonthlyRevenues(
          Object.entries(monthMap).sort(([a], [b]) => a.localeCompare(b)).map(([month, revenue]) => ({ month, revenue }))
        )

        // Service line data — need to join lines with invoices to get current month
        // Build invoice ID set for current month

        // We need fin_invoice_id -> qb_invoice_id mapping. Since we don't have it directly from lines,
        // let's get it from the invoices table (paginated)
        async function fetchInvIdMap() {
          const all: any[] = []
          let from = 0
          const pageSize = 1000
          while (true) {
            const { data, error } = await supabase
              .from('fin_invoices')
              .select('id,qb_invoice_id,invoice_date')
              .gte('invoice_date', yearStart)
              .range(from, from + pageSize - 1)
            if (error) throw error
            all.push(...(data || []))
            if (!data || data.length < pageSize) break
            from += pageSize
          }
          return all
        }
        const invIdData = await fetchInvIdMap()
        const invIdMap: Record<string, { qb_id: string; date: string }> = {}
        for (const row of invIdData) {
          invIdMap[row.id] = { qb_id: row.qb_invoice_id, date: row.invoice_date }
        }

        // Calculate current week boundaries (Monday-Sunday) — used by service lines, tech, and customers
        const nowDate = new Date()
        const dayOfWeek = nowDate.getDay() // 0=Sun, 1=Mon...
        const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
        const weekStart = new Date(nowDate)
        weekStart.setDate(nowDate.getDate() + mondayOffset)
        const weekStartStr = weekStart.toISOString().split('T')[0]
        const weekEnd = new Date(weekStart)
        weekEnd.setDate(weekStart.getDate() + 6)
        const weekEndStr = weekEnd.toISOString().split('T')[0]

        const slMap: Record<string, { revenue: number; count: number; currentMonth: number; currentWeek: number }> = {}
        for (const line of lines) {
          const sl = line.service_line || 'other'
          if (!slMap[sl]) slMap[sl] = { revenue: 0, count: 0, currentMonth: 0, currentWeek: 0 }
          const invInfo = invIdMap[line.fin_invoice_id]
          if (!invInfo) continue // line belongs to an invoice outside our date range
          slMap[sl].revenue += line.amount || 0
          slMap[sl].count++
          if (invInfo.date >= monthStart && invInfo.date <= monthEnd) {
            slMap[sl].currentMonth += line.amount || 0
          }
          if (invInfo.date >= weekStartStr && invInfo.date <= weekEndStr) {
            slMap[sl].currentWeek += line.amount || 0
          }
        }
        setServiceLineData(slMap)

        // Tech data
        const techMap: Record<string, { revenue: number; count: number; currentMonth: number; currentWeek: number }> = {}
        for (const inv of invoices) {
          const tech = inv.tech_name || '(untagged)'
          if (!techMap[tech]) techMap[tech] = { revenue: 0, count: 0, currentMonth: 0, currentWeek: 0 }
          techMap[tech].revenue += inv.total || 0
          techMap[tech].count++
          if (inv.invoice_date >= monthStart && inv.invoice_date <= monthEnd) {
            techMap[tech].currentMonth += inv.total || 0
          }
          if (inv.invoice_date >= weekStartStr && inv.invoice_date <= weekEndStr) {
            techMap[tech].currentWeek += inv.total || 0
          }
        }
        setTechData(
          Object.entries(techMap)
            .map(([name, d]) => ({ name, ...d }))
            .sort((a, b) => b.revenue - a.revenue)
        )

        // Customer data (top 20 by revenue, with avg days-to-pay)
        const custMap: Record<string, { revenue: number; count: number; daysToPay: number[]; currentMonth: number; currentWeek: number }> = {}
        for (const inv of invoices) {
          const cust = inv.customer_name || '(unknown)'
          if (!custMap[cust]) custMap[cust] = { revenue: 0, count: 0, daysToPay: [], currentMonth: 0, currentWeek: 0 }
          custMap[cust].revenue += inv.total || 0
          custMap[cust].count++
          if (inv.invoice_date >= monthStart && inv.invoice_date <= monthEnd) {
            custMap[cust].currentMonth += inv.total || 0
          }
          if (inv.invoice_date >= weekStartStr && inv.invoice_date <= weekEndStr) {
            custMap[cust].currentWeek += inv.total || 0
          }
          if (inv.paid_date && inv.invoice_date) {
            const invDate = new Date(inv.invoice_date)
            const paidDate = new Date(inv.paid_date)
            const days = Math.round((paidDate.getTime() - invDate.getTime()) / (1000 * 60 * 60 * 24))
            if (days >= 0 && days < 365) custMap[cust].daysToPay.push(days)
          }
        }
        setCustomerData(
          Object.entries(custMap)
            .map(([name, d]) => ({
              name,
              revenue: d.revenue,
              count: d.count,
              avgDaysToPay: d.daysToPay.length > 0 ? d.daysToPay.reduce((a, b) => a + b, 0) / d.daysToPay.length : null,
              currentMonth: d.currentMonth,
              currentWeek: d.currentWeek,
            }))
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 20)
        )
      } catch (err: any) {
        setError(err.message || 'Failed to load financial data')
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [user])

  if (user && user.id !== OWNER_ID) {
    return <div className="min-h-screen flex items-center justify-center"><p className="text-[var(--color-muted)]">Access restricted</p></div>
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin w-6 h-6 border-2 border-[var(--color-primary)] border-t-transparent rounded-full" /></div>
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

  // Pace calculations
  const projectedMonthRevenue = dayOfMonth > 0 ? (currentMonthRevenue / dayOfMonth) * daysInMonth : 0
  const ytdMonths = monthlyRevenues.length || 1
  const avgMonthlyRevenue = ytdRevenue / ytdMonths
  const annualizedRevenue = avgMonthlyRevenue * 12
  const hasData = ytdRevenue > 0

  // Month labels
  const currentMonthLabel = new Date().toLocaleString('default', { month: 'long' })

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-4 pb-24 md:pb-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <TrendingUp size={20} className="text-[var(--color-primary)]" />
          Financial Advisor
        </h1>
        <p className="text-xs text-[var(--color-muted)] mt-0.5">Owner dashboard · Private · Updated {new Date().toLocaleDateString()}</p>
      </div>

      {/* ── Section 1: Pulse ── */}
      <div className="bg-[var(--color-surface)] rounded-xl p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Activity size={16} className="text-[var(--color-primary)]" />
          <h2 className="text-sm font-semibold uppercase tracking-wider">Pulse</h2>
          <span className="text-[10px] text-[var(--color-muted)]">{currentMonthLabel} · Day {dayOfMonth}/{daysInMonth}</span>
        </div>

        {!hasData ? (
          <EmptyState message="No invoice data yet — awaiting first sync" />
        ) : (
          <div className="space-y-4">
            <BarIndicator
              value={currentMonthRevenue}
              target={MONTHLY_TARGET}
              label={`${currentMonthLabel} Revenue (${currentMonthInvoices} invoices)`}
            />
            {projectedMonthRevenue > 0 && (
              <p className="text-[10px] text-[var(--color-muted)] -mt-2 text-right">
                Projected: {fmt(projectedMonthRevenue)} at current pace
              </p>
            )}

            <BarIndicator
              value={annualizedRevenue}
              target={ANNUAL_TARGET}
              label={`Annualized Revenue (YTD avg: ${fmtK(avgMonthlyRevenue)}/mo)`}
              color={annualizedRevenue >= ANNUAL_TARGET * 0.9 ? '#22C55E' : annualizedRevenue >= ANNUAL_TARGET * 0.75 ? '#F59E0B' : '#EF4444'}
            />

            <div className="grid grid-cols-2 gap-3">
              <StatBox icon={DollarSign} label="YTD Revenue" value={fmt(ytdRevenue)} sub={`${ytdMonths} months`} />
              <StatBox icon={Calendar} label="Avg Monthly" value={fmt(avgMonthlyRevenue)} sub={annualizedRevenue >= ANNUAL_TARGET ? '✓ On pace' : `${fmtK(ANNUAL_TARGET - annualizedRevenue)} below target`} />
            </div>

            {/* Monthly mini bars */}
            <div>
              <p className="text-xs text-[var(--color-muted)] mb-2">Monthly Revenue</p>
              <div className="flex items-end gap-1 h-16">
                {monthlyRevenues.map(({ month, revenue }) => {
                  const pct = Math.min((revenue / (MONTHLY_TARGET * 1.2)) * 100, 100)
                  const isCurrentMonth = month === `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`
                  return (
                    <div key={month} className="flex-1 flex flex-col items-center gap-0.5">
                      <div
                        className="w-full rounded-t transition-all duration-300"
                        style={{
                          height: `${pct}%`,
                          minHeight: '2px',
                          background: isCurrentMonth ? 'var(--color-primary)' : revenue >= MONTHLY_TARGET ? '#22C55E' : revenue >= MONTHLY_TARGET * 0.8 ? '#F59E0B' : '#EF4444',
                          opacity: isCurrentMonth ? 1 : 0.7,
                        }}
                        title={`${month}: ${fmt(revenue)}`}
                      />
                      <span className="text-[8px] text-[var(--color-muted)]">{month.split('-')[1]}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Section 2: Service Lines ── */}
      <div className="bg-[var(--color-surface)] rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wrench size={16} className="text-[var(--color-primary)]" />
            <h2 className="text-sm font-semibold uppercase tracking-wider">Service Lines</h2>
          </div>
          <div className="flex bg-[var(--color-bg)] rounded-lg p-0.5">
            <button onClick={() => setSvcPeriod('weekly')} className={`px-3 py-1 text-xs rounded-md min-h-[32px] transition-colors ${svcPeriod === 'weekly' ? 'bg-[var(--color-primary)] text-white font-semibold' : 'text-[var(--color-muted)]'}`}>Weekly</button>
            <button onClick={() => setSvcPeriod('monthly')} className={`px-3 py-1 text-xs rounded-md min-h-[32px] transition-colors ${svcPeriod === 'monthly' ? 'bg-[var(--color-primary)] text-white font-semibold' : 'text-[var(--color-muted)]'}`}>Monthly</button>
          </div>
        </div>

        {!hasData ? (
          <EmptyState message="No data yet — awaiting first sync" />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {SERVICE_LINES.map(({ key, label, icon: Icon }) => {
              const data = serviceLineData[key]
              const periodRevenue = data ? (svcPeriod === 'weekly' ? data.currentWeek : data.currentMonth) : 0
              const allPeriodTotals = Object.values(serviceLineData).reduce((sum, d) => sum + (svcPeriod === 'weekly' ? d.currentWeek : d.currentMonth), 0)
              const pctOfPeriod = data && allPeriodTotals > 0 ? (periodRevenue / allPeriodTotals) * 100 : 0
              const periodLabel = svcPeriod === 'weekly' ? 'This Week' : currentMonthLabel

              return (
                <div key={key} className="bg-[var(--color-bg)] rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Icon size={14} className="text-[var(--color-primary)]" />
                      <span className="text-sm font-medium">{label}</span>
                    </div>
                    {data && periodRevenue > 0 && (
                      <span className="text-[10px] text-[var(--color-muted)]">{pctOfPeriod.toFixed(0)}% of {svcPeriod === 'weekly' ? 'week' : 'month'}</span>
                    )}
                  </div>

                  {data ? (
                    <div className="space-y-1.5">
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                        <div>
                          <span className="text-[var(--color-muted)]">{periodLabel}</span>
                          <p className="font-semibold">{fmt(periodRevenue)}</p>
                        </div>
                        <div>
                          <span className="text-[var(--color-muted)]">YTD</span>
                          <p className="font-semibold">{fmt(data.revenue)}</p>
                        </div>
                        <div>
                          <span className="text-[var(--color-muted)]">Line Items</span>
                          <p className="font-semibold">{data.count}</p>
                        </div>
                        <div>
                          <span className="text-[var(--color-muted)]">$/hr</span>
                          <p className="font-semibold text-[var(--color-muted)] italic text-[10px]">needs hours</p>
                        </div>
                      </div>
                      {/* Revenue share bar */}
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#1E293B' }}>
                        <div className="h-full rounded-full" style={{ width: `${pctOfPeriod}%`, background: 'var(--color-primary)', opacity: 0.7 }} />
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-[var(--color-muted)]">No revenue recorded</p>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Section 2b: Tech Performance ── */}
      <div className="bg-[var(--color-surface)] rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users size={16} className="text-[var(--color-primary)]" />
            <h2 className="text-sm font-semibold uppercase tracking-wider">Tech Performance</h2>
          </div>
          <div className="flex bg-[var(--color-bg)] rounded-lg p-0.5">
            <button
              onClick={() => setTechPeriod('weekly')}
              className={`px-3 py-1 text-xs rounded-md min-h-[32px] transition-colors ${techPeriod === 'weekly' ? 'bg-[var(--color-primary)] text-white font-semibold' : 'text-[var(--color-muted)]'}`}
            >Weekly</button>
            <button
              onClick={() => setTechPeriod('monthly')}
              className={`px-3 py-1 text-xs rounded-md min-h-[32px] transition-colors ${techPeriod === 'monthly' ? 'bg-[var(--color-primary)] text-white font-semibold' : 'text-[var(--color-muted)]'}`}
            >Monthly</button>
          </div>
        </div>

        {techData.length === 0 ? (
          <EmptyState message="No tech data yet" />
        ) : (
          <div className="space-y-2">
            {techData.filter(t => !['(untagged)', 'Scan Tool', 'Teaching', 'Podcast'].includes(t.name)).map((tech) => {
              const periodRevenue = techPeriod === 'weekly' ? tech.currentWeek : tech.currentMonth
              const allPeriodRevenues = techData
                .filter(t => !['(untagged)', 'Scan Tool', 'Teaching', 'Podcast'].includes(t.name))
                .map(t => techPeriod === 'weekly' ? t.currentWeek : t.currentMonth)
              const maxPeriodRev = Math.max(...allPeriodRevenues, 1)
              const pct = (periodRevenue / maxPeriodRev) * 100
              const periodLabel = techPeriod === 'weekly' ? 'This Week' : currentMonthLabel

              return (
                <div key={tech.name} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{tech.name}</span>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-[var(--color-muted)]">YTD: {fmt(tech.revenue)}</span>
                      <span className="font-semibold">{fmt(periodRevenue)}</span>
                    </div>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: '#1E293B' }}>
                    <div className="h-full rounded-full transition-all duration-300" style={{ width: `${pct}%`, background: 'var(--color-primary)', opacity: 0.8 }} />
                  </div>
                  <div className="flex justify-between text-[10px] text-[var(--color-muted)]">
                    <span>{periodLabel}</span>
                    <span>{tech.count} invoices YTD · Avg: {fmt(tech.revenue / (tech.count || 1))}/inv</span>
                  </div>
                </div>
              )
            })}
            {/* Other categories */}
            {techData.filter(t => ['Scan Tool', 'Teaching', 'Podcast'].includes(t.name)).length > 0 && (
              <div className="pt-2 border-t border-gray-800">
                <p className="text-[10px] text-[var(--color-muted)] mb-1">Other Revenue Sources</p>
                <div className="flex flex-wrap gap-2">
                  {techData.filter(t => ['Scan Tool', 'Teaching', 'Podcast'].includes(t.name)).map(t => (
                    <span key={t.name} className="text-xs bg-[var(--color-bg)] rounded px-2 py-1">
                      {t.name}: {fmt(t.revenue)}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Section 3: Customers ── */}
      <div className="bg-[var(--color-surface)] rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users size={16} className="text-[var(--color-primary)]" />
            <h2 className="text-sm font-semibold uppercase tracking-wider">Top Customers</h2>
          </div>
          <div className="flex bg-[var(--color-bg)] rounded-lg p-0.5">
            <button onClick={() => setCustPeriod('weekly')} className={`px-3 py-1 text-xs rounded-md min-h-[32px] transition-colors ${custPeriod === 'weekly' ? 'bg-[var(--color-primary)] text-white font-semibold' : 'text-[var(--color-muted)]'}`}>Weekly</button>
            <button onClick={() => setCustPeriod('monthly')} className={`px-3 py-1 text-xs rounded-md min-h-[32px] transition-colors ${custPeriod === 'monthly' ? 'bg-[var(--color-primary)] text-white font-semibold' : 'text-[var(--color-muted)]'}`}>Monthly</button>
          </div>
        </div>

        {customerData.length === 0 ? (
          <EmptyState message="No customer data yet" />
        ) : (
          <div className="space-y-1">
            {[...customerData]
              .sort((a, b) => {
                const aRev = custPeriod === 'weekly' ? a.currentWeek : a.currentMonth
                const bRev = custPeriod === 'weekly' ? b.currentWeek : b.currentMonth
                return bRev - aRev
              })
              .filter(c => (custPeriod === 'weekly' ? c.currentWeek : c.currentMonth) > 0)
              .slice(0, 15)
              .map((c, idx) => {
                const periodRevenue = custPeriod === 'weekly' ? c.currentWeek : c.currentMonth
                return (
                  <div key={c.name} className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0 min-h-[44px]">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="text-xs text-[var(--color-muted)] w-5 flex-shrink-0">{idx + 1}</span>
                      <span className="text-sm font-medium truncate">{c.name}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs flex-shrink-0">
                      <span className="text-[var(--color-muted)]">{c.count} inv YTD</span>
                      {c.avgDaysToPay != null && (
                        <span className={`${c.avgDaysToPay <= 7 ? 'text-green-400' : c.avgDaysToPay <= 30 ? 'text-yellow-400' : 'text-red-400'}`}>
                          {c.avgDaysToPay.toFixed(0)}d pay
                        </span>
                      )}
                      <span className="font-semibold w-16 text-right">{fmt(periodRevenue)}</span>
                    </div>
                  </div>
                )
              })}
          </div>
        )}
      </div>

      {/* ── Section 4: Advisor ── */}
      <div className="bg-[var(--color-surface)] rounded-xl p-4 space-y-4">
        <div className="flex items-center gap-2">
          <MessageSquare size={16} className="text-[var(--color-primary)]" />
          <h2 className="text-sm font-semibold uppercase tracking-wider">Advisor</h2>
          <span className="text-[10px] text-[var(--color-muted)]">Ledger</span>
        </div>

        {/* Quick insights computed from data */}
        {hasData && (
          <div className="bg-[var(--color-bg)] rounded-lg p-4 space-y-2">
            <p className="text-xs text-[var(--color-muted)] uppercase tracking-wider mb-2">Quick Insights</p>
            <ul className="space-y-1.5 text-sm">
              <li className="flex items-start gap-2">
                <span>{annualizedRevenue >= ANNUAL_TARGET ? '✅' : '⚠️'}</span>
                <span>Annualized revenue: {fmt(annualizedRevenue)} — {annualizedRevenue >= ANNUAL_TARGET ? 'on pace for $700k' : `${fmtK(ANNUAL_TARGET - annualizedRevenue)} below $700k target`}</span>
              </li>
              {(() => {
                const topSvc = Object.entries(serviceLineData).sort(([,a], [,b]) => b.revenue - a.revenue)[0]
                if (topSvc) {
                  const pct = ((topSvc[1].revenue / ytdRevenue) * 100).toFixed(0)
                  return <li className="flex items-start gap-2"><span>📊</span><span>Top service line: {topSvc[0]} ({pct}% of revenue)</span></li>
                }
                return null
              })()}
              {(() => {
                const fieldTechs = techData.filter(t => ['Sean', 'Steve', 'Nooh'].includes(t.name))
                if (fieldTechs.length >= 2) {
                  const max = fieldTechs.reduce((a, b) => a.revenue > b.revenue ? a : b)
                  const min = fieldTechs.reduce((a, b) => a.revenue < b.revenue ? a : b)
                  const spread = max.revenue - min.revenue
                  return <li className="flex items-start gap-2"><span>👥</span><span>Tech spread: {fmt(spread)} between {max.name} ({fmt(max.revenue)}) and {min.name} ({fmt(min.revenue)})</span></li>
                }
                return null
              })()}
              {(() => {
                const slowPayers = customerData.filter(c => c.avgDaysToPay != null && c.avgDaysToPay > 30 && c.count >= 3)
                if (slowPayers.length > 0) {
                  return <li className="flex items-start gap-2"><span>🐢</span><span>Slow payers ({'>'}30d avg): {slowPayers.map(c => c.name).slice(0, 3).join(', ')}</span></li>
                }
                return null
              })()}
            </ul>
          </div>
        )}

        {/* Weekly Analysis placeholder */}
        <div className="bg-[var(--color-bg)] rounded-lg p-4">
          <p className="text-xs text-[var(--color-muted)] uppercase tracking-wider mb-2">Weekly Analysis</p>
          <div className="flex flex-col items-center py-4 text-center">
            <Clock size={20} className="text-[var(--color-muted)] mb-2" />
            <p className="text-sm text-[var(--color-muted)]">Full weekly Ledger analysis will appear here once the calendar hours engine is running</p>
          </div>
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
                    <p className="text-[10px] text-[var(--color-muted)] mt-1">{new Date(alert.fired_at).toLocaleDateString()}</p>
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
