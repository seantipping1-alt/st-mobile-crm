import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import {
  TrendingUp,
  DollarSign,
  Car,
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
  RefreshCw,
} from 'lucide-react'

const OWNER_ID = '095969b8-e5da-45a1-a26e-483fac0cc94c'

const ANNUAL_TARGET = 700_000
const MONTHLY_TARGET = Math.round(ANNUAL_TARGET / 12)

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
  const [svcOffset, setSvcOffset] = useState(0) // 0 = current, -1 = last month/week, etc.
  const [svcLineItems, setSvcLineItems] = useState<{ service_line: string; amount: number; date: string }[]>([])
  const [custPeriod, setCustPeriod] = useState<'monthly' | 'yearly'>('monthly')
  const [customerData, setCustomerData] = useState<{ name: string; revenue: number; count: number; avgDaysToPay: number | null; currentMonth: number; currentWeek: number }[]>([])
  const [daysInMonth, setDaysInMonth] = useState(0)
  const [dayOfMonth, setDayOfMonth] = useState(0)
  const [hoursData, setHoursData] = useState<Record<string, { jobHours: number; driveHours: number; currentMonth: number; currentWeek: number }>>({})
  const [techHoursData, setTechHoursData] = useState<Record<string, { jobHours: number; driveHours: number; currentMonth: number; currentWeek: number }>>({})
  const [plData, setPlData] = useState<{ month: string; revenue: number; expenses: number; net_income: number; cogs: number }[]>([])
  const [techSalaries, setTechSalaries] = useState<{ tech_name: string; annual_salary: number; monthly_salary: number; bonus_eligible: boolean }[]>([])
  const [keyCogs, setKeyCogs] = useState<number>(0)
  const [subscriptions, setSubscriptions] = useState<{ vendor: string; oem: string | null; service_line: string | null; term: string; cost: number; note: string | null }[]>([])
  const [oemDayPasses, setOemDayPasses] = useState<{ brand: string; passes: number; spend: number }[]>([])

  const [syncing, setSyncing] = useState(false)
  const [lastSynced, setLastSynced] = useState<string | null>(null)

  // Auth gate
  useEffect(() => {
    if (user && user.id !== OWNER_ID) navigate('/', { replace: true })
  }, [user, navigate])

  // Reusable data loader
  async function loadData(showSpinner = true) {
    if (showSpinner) setLoading(true)
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
        const [invoices, lines, alertsRes, hoursRes, plRes, salaryRes, keyExpRes, subsRes, oemExpRes] = await Promise.all([
          fetchAllInvoices(),
          fetchAllLines(),
          supabase.from('fin_alerts').select('*').eq('acknowledged', false).order('fired_at', { ascending: false }),
          supabase.from('fin_hours').select('date,tech_name,service_line,job_hours,drive_hours').gte('date', yearStart).range(0, 4999),
          supabase.from('fin_monthly_pl').select('month,revenue,expenses,net_income,cogs').gte('month', yearStart).order('month', { ascending: true }),
          supabase.from('fin_tech_salaries').select('tech_name,annual_salary,monthly_salary,bonus_eligible,effective_date'),
          supabase.from('fin_expenses').select('vendor_name,amount,txn_date').in('vendor_name', ['Transponder Island', 'Locksmith Keyless', 'UHS']).gte('txn_date', yearStart),
          supabase.from('fin_subscriptions').select('vendor,oem,service_line,pool,term,cost,note'),
          supabase.from('fin_expenses').select('vendor_name,amount,txn_date,treatment,service_line').eq('treatment', 'per_use_oem').eq('service_line', 'programming').gte('txn_date', yearStart),
        ])

        if (alertsRes.error) throw alertsRes.error
        setAlerts(alertsRes.data || [])

        // P&L data
        setPlData((plRes.data || []).map((r: any) => ({
          month: r.month.substring(0, 7), // "2026-01"
          revenue: r.revenue,
          expenses: r.expenses,
          net_income: r.net_income,
          cogs: r.cogs,
        })))

        // Tech salaries
        setTechSalaries((salaryRes.data || []).map((r: any) => ({
          tech_name: r.tech_name,
          annual_salary: r.annual_salary,
          monthly_salary: r.monthly_salary,
          bonus_eligible: r.bonus_eligible,
        })))

        // Key COGS (Transponder Island + Locksmith Keyless + UHS ≤ $300)
        const keyExpenses = (keyExpRes.data || []) as any[]
        const totalKeyCogs = keyExpenses
          .filter((e: any) => e.vendor_name !== 'UHS' || e.amount <= 300)
          .reduce((s: number, e: any) => s + (e.amount || 0), 0)
        setKeyCogs(totalKeyCogs)

        // Subscriptions
        setSubscriptions((subsRes.data || []).map((r: any) => ({
          vendor: r.vendor, oem: r.oem, service_line: r.service_line,
          term: r.term, cost: r.cost, note: r.note,
        })))

        // OEM day pass spending — group by brand
        const oemMap: Record<string, { passes: number; spend: number }> = {}
        for (const e of (oemExpRes.data || []) as any[]) {
          const vn = (e.vendor_name || '').toLowerCase()
          let brand = 'Other'
          if (vn.includes('tweddle') || vn.includes('nissan')) brand = 'Nissan'
          else if (vn.includes('honda motor')) brand = 'Honda'
          else if (vn.includes('honda store')) brand = 'Honda'
          else if (vn.includes('toyota')) brand = 'Toyota'
          else if (vn.includes('sbs')) brand = 'Kia/Hyundai'
          else if (vn.includes('hyundai')) brand = 'Kia/Hyundai'
          else if (vn.includes('volvo')) brand = 'Volvo'
          else if (vn.includes('bmw')) brand = 'BMW'
          else if (vn.includes('mitsubishi')) brand = 'Mitsubishi'
          else if (vn.includes('porsche')) brand = 'Porsche'
          else if (vn.includes('hp tuners')) brand = 'HP Tuners'

          if (!oemMap[brand]) oemMap[brand] = { passes: 0, spend: 0 }
          oemMap[brand].passes++
          oemMap[brand].spend += e.amount || 0
        }
        setOemDayPasses(
          Object.entries(oemMap)
            .map(([brand, data]) => ({ brand, ...data }))
            .sort((a, b) => b.spend - a.spend)
        )

        // Process hours data (done after week boundaries below)
        const hours = hoursRes.data || []

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

        // Process hours data now that week boundaries are available
        const svcHours: Record<string, { jobHours: number; driveHours: number; currentMonth: number; currentWeek: number }> = {}
        const techHrs: Record<string, { jobHours: number; driveHours: number; currentMonth: number; currentWeek: number }> = {}

        for (const h of hours) {
          // By service line
          if (!svcHours[h.service_line]) svcHours[h.service_line] = { jobHours: 0, driveHours: 0, currentMonth: 0, currentWeek: 0 }
          svcHours[h.service_line].jobHours += h.job_hours || 0
          svcHours[h.service_line].driveHours += h.drive_hours || 0
          if (h.date >= monthStart && h.date <= monthEnd) svcHours[h.service_line].currentMonth += h.job_hours || 0
          if (h.date >= weekStartStr && h.date <= weekEndStr) svcHours[h.service_line].currentWeek += h.job_hours || 0

          // By tech
          if (!techHrs[h.tech_name]) techHrs[h.tech_name] = { jobHours: 0, driveHours: 0, currentMonth: 0, currentWeek: 0 }
          techHrs[h.tech_name].jobHours += h.job_hours || 0
          techHrs[h.tech_name].driveHours += h.drive_hours || 0
          if (h.date >= monthStart && h.date <= monthEnd) techHrs[h.tech_name].currentMonth += h.job_hours || 0
          if (h.date >= weekStartStr && h.date <= weekEndStr) techHrs[h.tech_name].currentWeek += h.job_hours || 0
        }
        setHoursData(svcHours)
        setTechHoursData(techHrs)

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

        // Store flat line items with dates for historical period navigation
        const flatItems: { service_line: string; amount: number; date: string }[] = []
        for (const line of lines) {
          const invInfo = invIdMap[line.fin_invoice_id]
          if (!invInfo) continue
          flatItems.push({ service_line: line.service_line || 'other', amount: line.amount || 0, date: invInfo.date })
        }
        setSvcLineItems(flatItems)

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

  // Initial load
  useEffect(() => {
    if (!user || user.id !== OWNER_ID) return
    loadData()
  }, [user])

  // Manual sync — triggers all 3 syncs then reloads data
  async function handleSync() {
    setSyncing(true)
    try {
      const results = await Promise.allSettled([
        fetch('/api/qb-sync-invoices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ since: new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0] }) }),
        fetch('/api/gcal-sync-hours', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ days: 14 }) }),
        fetch('/api/qb-sync-pl', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ months: 2 }) }),
      ])

      const summaries: string[] = []
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value.ok) {
          const data = await r.value.json().catch(() => ({}))
          if (data.invoices != null) summaries.push(`${data.invoices} invoices`)
          if (data.events_classified != null) summaries.push(`${data.events_classified} cal events`)
          if (data.months?.length) summaries.push(`${data.months.length} P&L months`)
        }
      }

      setLastSynced(summaries.length > 0 ? summaries.join(' · ') : 'Synced')
      await loadData(false) // Reload data without showing spinner
    } catch (err: any) {
      setLastSynced('Sync failed')
    } finally {
      setSyncing(false)
    }
  }

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

  // P&L computed values
  const OWNER_TAKE_TARGET = 12_500
  const BONUS_FLOOR = 14_000
  const BONUS_TOP = 20_000
  const currentMonthKey = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`
  const currentPl = plData.find(p => p.month === currentMonthKey)
  const ytdNetIncome = plData.reduce((s, p) => s + p.net_income, 0)
  const avgMonthlyProfit = plData.length > 0 ? ytdNetIncome / plData.length : 0
  const netMargin = ytdRevenue > 0 ? ytdNetIncome / plData.reduce((s, p) => s + p.revenue, 0) : 0

  // Month labels
  const currentMonthLabel = new Date().toLocaleString('default', { month: 'long' })

  // Service line period navigation — compute period boundaries based on offset
  const svcPeriodInfo = (() => {
    const now = new Date()
    if (svcPeriod === 'monthly') {
      const d = new Date(now.getFullYear(), now.getMonth() + svcOffset, 1)
      const start = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
      const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
      const end = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
      const label = d.toLocaleString('default', { month: 'long' })
      const isCurrent = svcOffset === 0
      return { start, end, label, isCurrent }
    } else {
      // Weekly: compute Monday of the target week
      const dayOfWeek = now.getDay()
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
      const monday = new Date(now)
      monday.setDate(now.getDate() + mondayOffset + svcOffset * 7)
      const sunday = new Date(monday)
      sunday.setDate(monday.getDate() + 6)
      const start = monday.toISOString().split('T')[0]
      const end = sunday.toISOString().split('T')[0]
      const label = `${monday.toLocaleDateString('default', { month: 'short', day: 'numeric' })} – ${sunday.toLocaleDateString('default', { month: 'short', day: 'numeric' })}`
      const isCurrent = svcOffset === 0
      return { start, end, label, isCurrent }
    }
  })()

  // Compute service line data for the selected period
  const svcPeriodData = (() => {
    const result: Record<string, { periodRevenue: number; periodCount: number }> = {}
    for (const item of svcLineItems) {
      if (item.date >= svcPeriodInfo.start && item.date <= svcPeriodInfo.end) {
        if (!result[item.service_line]) result[item.service_line] = { periodRevenue: 0, periodCount: 0 }
        result[item.service_line].periodRevenue += item.amount
        result[item.service_line].periodCount++
      }
    }
    return result
  })()

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-4 pb-24 md:pb-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <TrendingUp size={20} className="text-[var(--color-primary)]" />
            Financial Advisor
          </h1>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">
            Owner dashboard · Private
            {lastSynced && <span> · {lastSynced}</span>}
          </p>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium min-h-[40px] transition-colors ${
            syncing
              ? 'bg-[var(--color-bg)] text-[var(--color-muted)] cursor-wait'
              : 'bg-[var(--color-primary)] text-white active:opacity-80'
          }`}
        >
          <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
          {syncing ? 'Syncing...' : 'Sync Now'}
        </button>
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

            {/* Owner Take (Net Profit) vs $12.5k target */}
            {currentPl && (
              <BarIndicator
                value={currentPl.net_income}
                target={OWNER_TAKE_TARGET}
                label={`${currentMonthLabel} Net Profit vs ${fmtK(OWNER_TAKE_TARGET)}/mo target`}
                color={currentPl.net_income >= BONUS_TOP ? '#22C55E' : currentPl.net_income >= BONUS_FLOOR ? '#3B82F6' : currentPl.net_income >= OWNER_TAKE_TARGET ? '#F59E0B' : '#EF4444'}
              />
            )}
            {currentPl && (
              <div className="flex items-center justify-between text-[10px] -mt-2">
                <span className={`px-2 py-0.5 rounded-full font-medium ${
                  currentPl.net_income >= BONUS_TOP ? 'bg-green-500/20 text-green-400' :
                  currentPl.net_income >= BONUS_FLOOR ? 'bg-blue-500/20 text-blue-400' :
                  'text-[var(--color-muted)]'
                }`}>
                  {currentPl.net_income >= BONUS_TOP ? '✦ Bonus maxed (4%)' :
                   currentPl.net_income >= BONUS_FLOOR ? `✦ Bonus zone (${(0.02 + 0.02 * ((currentPl.net_income - BONUS_FLOOR) / (BONUS_TOP - BONUS_FLOOR))).toFixed(1)}%)` :
                   currentPl.net_income >= OWNER_TAKE_TARGET ? 'Below bonus floor' :
                   'Below owner take target'}
                </span>
                <span className="text-[var(--color-muted)]">Expenses: {fmt(currentPl.expenses + currentPl.cogs)}</span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <StatBox icon={DollarSign} label="YTD Revenue" value={fmt(ytdRevenue)} sub={`${ytdMonths} months`} />
              <StatBox icon={DollarSign} label="YTD Net Income" value={fmt(ytdNetIncome)} sub={`${fmt(netMargin, 'percent')} margin`} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <StatBox icon={Calendar} label="Avg Monthly Rev" value={fmt(avgMonthlyRevenue)} sub={annualizedRevenue >= ANNUAL_TARGET ? '✓ On pace' : `${fmtK(ANNUAL_TARGET - annualizedRevenue)} below target`} />
              <StatBox icon={Calendar} label="Avg Monthly Profit" value={fmt(avgMonthlyProfit)} sub={avgMonthlyProfit >= OWNER_TAKE_TARGET ? '✓ Above target' : `${fmtK(OWNER_TAKE_TARGET - avgMonthlyProfit)} below target`} />
            </div>

            {/* $/hr and Drive Ratio from hours data */}
            {Object.keys(hoursData).length > 0 && (() => {
              const totalJobHrs = Object.values(hoursData).reduce((s, d) => s + d.jobHours, 0)
              const totalDriveHrs = Object.values(hoursData).reduce((s, d) => s + d.driveHours, 0)
              const totalHrs = totalJobHrs + totalDriveHrs
              const dph = totalJobHrs > 0 ? ytdRevenue / totalJobHrs : null
              const dphWithDrive = totalHrs > 0 ? ytdRevenue / totalHrs : null
              const driveRatio = totalHrs > 0 ? totalDriveHrs / totalHrs : null
              return (
                <div className="grid grid-cols-3 gap-3">
                  <StatBox icon={DollarSign} label="$/Job Hour" value={dph ? fmt(dph) : '—'} sub={`${totalJobHrs.toFixed(0)} hrs YTD`} />
                  <StatBox icon={DollarSign} label="$/Total Hour" value={dphWithDrive ? fmt(dphWithDrive) : '—'} sub="incl. drive" />
                  <StatBox icon={Car} label="Drive Ratio" value={driveRatio ? fmt(driveRatio, 'percent') : '—'} sub={`${totalDriveHrs.toFixed(0)} hrs`} />
                </div>
              )
            })()}

            {/* Monthly mini bars — Revenue + Profit */}
            <div>
              <p className="text-xs text-[var(--color-muted)] mb-2">Monthly Revenue & Profit</p>
              <div className="overflow-x-auto -mx-1 px-1 scrollbar-hide" style={{ WebkitOverflowScrolling: 'touch' }}>
                <div className="flex items-end gap-3" style={{ height: '110px', minWidth: `${monthlyRevenues.length * 80}px` }}>
                  {monthlyRevenues.map(({ month, revenue }) => {
                    const maxRev = MONTHLY_TARGET * 1.2
                    const barHeight = Math.max(Math.round((revenue / maxRev) * 72), 4)
                    const pl = plData.find(p => p.month === month)
                    const profit = pl?.net_income || 0
                    const profitHeight = profit > 0 ? Math.max(Math.round((profit / maxRev) * 72), 2) : 0
                    const isCurrentMonth = month === currentMonthKey
                    const revColor = isCurrentMonth ? 'var(--color-primary)' : revenue >= MONTHLY_TARGET ? '#22C55E' : revenue >= MONTHLY_TARGET * 0.8 ? '#F59E0B' : '#EF4444'
                    const profitColor = profit >= BONUS_TOP ? '#22C55E' : profit >= BONUS_FLOOR ? '#3B82F6' : profit >= OWNER_TAKE_TARGET ? '#F59E0B' : '#EF4444'
                    const monthLabel = new Date(month + '-02').toLocaleString('default', { month: 'short' })
                    return (
                      <div key={month} className="flex flex-col items-center justify-end" style={{ height: '110px', width: '64px', flexShrink: 0 }}>
                        <span className="text-[9px] text-[var(--color-muted)] mb-1">{fmtK(revenue)}</span>
                        <div className="flex gap-1 items-end">
                          <div
                            className="rounded-t transition-all duration-300"
                            style={{ height: `${barHeight}px`, width: '24px', background: revColor, opacity: isCurrentMonth ? 1 : 0.7 }}
                            title={`${monthLabel}: Rev ${fmt(revenue)}`}
                          />
                          {profitHeight > 0 && (
                            <div
                              className="rounded-t transition-all duration-300"
                              style={{ height: `${profitHeight}px`, width: '24px', background: profitColor, opacity: 0.9 }}
                              title={`${monthLabel}: Profit ${fmt(profit)}`}
                            />
                          )}
                        </div>
                        <span className="text-[9px] text-[var(--color-muted)] mt-1 font-medium">{monthLabel}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
              <div className="flex items-center gap-3 mt-2 justify-center">
                <span className="flex items-center gap-1 text-[9px] text-[var(--color-muted)]"><span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: 'var(--color-primary)', opacity: 0.7 }} /> Revenue</span>
                <span className="flex items-center gap-1 text-[9px] text-[var(--color-muted)]"><span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: '#3B82F6', opacity: 0.9 }} /> Profit</span>
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
            <button onClick={() => { setSvcPeriod('weekly'); setSvcOffset(0) }} className={`px-3 py-1 text-xs rounded-md min-h-[32px] transition-colors ${svcPeriod === 'weekly' ? 'bg-[var(--color-primary)] text-white font-semibold' : 'text-[var(--color-muted)]'}`}>Weekly</button>
            <button onClick={() => { setSvcPeriod('monthly'); setSvcOffset(0) }} className={`px-3 py-1 text-xs rounded-md min-h-[32px] transition-colors ${svcPeriod === 'monthly' ? 'bg-[var(--color-primary)] text-white font-semibold' : 'text-[var(--color-muted)]'}`}>Monthly</button>
          </div>
        </div>

        {/* Period navigator */}
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => setSvcOffset(o => o - 1)}
            className="w-8 h-8 rounded-full bg-[var(--color-bg)] flex items-center justify-center text-[var(--color-muted)] hover:text-white transition-colors min-h-[32px]"
          >←</button>
          <span className="text-sm font-medium min-w-[140px] text-center">
            {svcPeriodInfo.label}
            {svcPeriodInfo.isCurrent && <span className="text-[10px] text-[var(--color-muted)] ml-1">(current)</span>}
          </span>
          <button
            onClick={() => setSvcOffset(o => Math.min(o + 1, 0))}
            disabled={svcOffset >= 0}
            className={`w-8 h-8 rounded-full bg-[var(--color-bg)] flex items-center justify-center transition-colors min-h-[32px] ${svcOffset >= 0 ? 'text-[var(--color-bg)]' : 'text-[var(--color-muted)] hover:text-white'}`}
          >→</button>
        </div>

        {!hasData ? (
          <EmptyState message="No data yet — awaiting first sync" />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {SERVICE_LINES.map(({ key, label, icon: Icon }) => {
              const data = serviceLineData[key]
              const period = svcPeriodData[key]
              const periodRevenue = period?.periodRevenue || 0
              const allPeriodTotals = Object.values(svcPeriodData).reduce((sum, d) => sum + d.periodRevenue, 0)
              const pctOfPeriod = periodRevenue > 0 && allPeriodTotals > 0 ? (periodRevenue / allPeriodTotals) * 100 : 0
              const periodLabel = svcPeriodInfo.label

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
                          <p className="font-semibold">{fmt(data.revenue)}{key === 'keys' && keyCogs > 0 ? <span className="text-[9px] text-[var(--color-muted)] ml-1">({fmt(data.revenue - keyCogs)} net)</span> : ''}</p>
                        </div>
                        <div>
                          <span className="text-[var(--color-muted)]">{key === 'keys' ? 'Margin' : 'Line Items'}</span>
                          <p className="font-semibold">{key === 'keys' && keyCogs > 0
                            ? `${((1 - keyCogs / data.revenue) * 100).toFixed(0)}%`
                            : data.count}</p>
                        </div>
                        <div>
                          <span className="text-[var(--color-muted)]">$/hr</span>
                          {(() => {
                            if (!svcPeriodInfo.isCurrent) {
                              return <p className="font-semibold text-[var(--color-muted)] italic text-[10px]">current only</p>
                            }
                            const svcHrs = hoursData[key]
                            const periodHrs = svcHrs ? (svcPeriod === 'weekly' ? svcHrs.currentWeek : svcHrs.currentMonth) : 0
                            // For keys, use gross profit for $/hr instead of raw revenue
                            const effectiveRevenue = key === 'keys' && keyCogs > 0 && data.revenue > 0
                              ? periodRevenue * (1 - keyCogs / data.revenue) // apply YTD margin ratio to period revenue
                              : periodRevenue
                            const dph = periodHrs > 0 ? effectiveRevenue / periodHrs : null
                            return dph != null
                              ? <p className="font-semibold">{fmt(dph)}{key === 'keys' ? <span className="text-[9px] text-[var(--color-muted)] ml-0.5">net</span> : ''}</p>
                              : <p className="font-semibold text-[var(--color-muted)] italic text-[10px]">no hours</p>
                          })()}
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
                    <span>{periodLabel}{(() => {
                      const th = techHoursData[tech.name]
                      const hrs = th ? (techPeriod === 'weekly' ? th.currentWeek : th.currentMonth) : 0
                      const dph = hrs > 0 ? periodRevenue / hrs : null
                      return dph != null ? ` · ${fmt(dph)}/hr` : ''
                    })()}</span>
                    <span>{tech.count} inv YTD · Avg: {fmt(tech.revenue / (tech.count || 1))}/inv</span>
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

      {/* ── Section 3: Tech Cost Ratios ── */}
      {techSalaries.length > 0 && techData.length > 0 && (
        <div className="bg-[var(--color-surface)] rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <DollarSign size={16} className="text-[var(--color-primary)]" />
            <h2 className="text-sm font-semibold uppercase tracking-wider">Tech Economics</h2>
          </div>

          {(() => {
            // Compute bonus rate from avg monthly profit
            const bonusRate = avgMonthlyProfit >= BONUS_TOP ? 0.04
              : avgMonthlyProfit >= BONUS_FLOOR ? 0.02 + 0.02 * ((avgMonthlyProfit - BONUS_FLOOR) / (BONUS_TOP - BONUS_FLOOR))
              : 0
            const completedMonths = plData.length || 1

            return (
              <div className="space-y-3">
                {techData
                  .filter(t => techSalaries.find(s => s.tech_name === t.name))
                  .sort((a, b) => b.revenue - a.revenue)
                  .map(tech => {
                    const salary = techSalaries.find(s => s.tech_name === tech.name)!
                    const totalSalary = salary.monthly_salary * completedMonths
                    const bonusPayout = salary.bonus_eligible ? salary.annual_salary * bonusRate * completedMonths / 12 : 0
                    const totalCost = totalSalary + bonusPayout
                    const contribution = tech.revenue - totalCost
                    const costRatio = tech.revenue > 0 ? totalCost / tech.revenue : 0
                    const hrs = techHoursData[tech.name]
                    const totalHrs = hrs ? hrs.jobHours + hrs.driveHours : 0
                    const costPerHr = totalHrs > 0 ? totalCost / totalHrs : null

                    return (
                      <div key={tech.name} className="bg-[var(--color-bg)] rounded-lg p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">{tech.name}</span>
                          <span className={`text-xs font-semibold ${contribution >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {contribution >= 0 ? '+' : ''}{fmt(contribution)} net
                          </span>
                        </div>

                        <div className="grid grid-cols-3 gap-2 text-[10px]">
                          <div>
                            <span className="text-[var(--color-muted)]">Revenue</span>
                            <p className="font-semibold text-xs">{fmt(tech.revenue)}</p>
                          </div>
                          <div>
                            <span className="text-[var(--color-muted)]">Total Cost</span>
                            <p className="font-semibold text-xs">{fmt(totalCost)}</p>
                          </div>
                          <div>
                            <span className="text-[var(--color-muted)]">Cost Ratio</span>
                            <p className={`font-semibold text-xs ${costRatio <= 0.4 ? 'text-green-400' : costRatio <= 0.6 ? 'text-yellow-400' : 'text-red-400'}`}>
                              {(costRatio * 100).toFixed(0)}%
                            </p>
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2 text-[10px]">
                          <div>
                            <span className="text-[var(--color-muted)]">Salary ({completedMonths}mo)</span>
                            <p className="text-xs">{fmt(totalSalary)}</p>
                          </div>
                          <div>
                            <span className="text-[var(--color-muted)]">Bonus Est.</span>
                            <p className="text-xs">{salary.bonus_eligible ? fmt(bonusPayout) : '—'}</p>
                          </div>
                          <div>
                            <span className="text-[var(--color-muted)]">Cost/hr</span>
                            <p className="text-xs">{costPerHr ? fmt(costPerHr) : '—'}</p>
                          </div>
                        </div>

                        {/* Contribution bar */}
                        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#1E293B' }}>
                          <div className="h-full rounded-full" style={{
                            width: `${Math.min(Math.max(((tech.revenue - totalCost) / tech.revenue) * 100, 0), 100)}%`,
                            background: contribution >= 0 ? '#22C55E' : '#EF4444',
                            opacity: 0.7
                          }} />
                        </div>
                      </div>
                    )
                  })}

                {bonusRate > 0 && (
                  <p className="text-[10px] text-[var(--color-muted)] text-center">
                    Estimated avg bonus rate: {(bonusRate * 100).toFixed(1)}% based on {fmt(avgMonthlyProfit)}/mo avg profit
                  </p>
                )}
              </div>
            )
          })()}
        </div>
      )}

      {/* ── Section 4: OEM & Subscription Costs ── */}
      {(subscriptions.length > 0 || oemDayPasses.length > 0) && (
        <div className="bg-[var(--color-surface)] rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Wrench size={16} className="text-[var(--color-primary)]" />
            <h2 className="text-sm font-semibold uppercase tracking-wider">OEM & Platform Costs</h2>
          </div>

          {/* Day Pass Spending */}
          {oemDayPasses.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] text-[var(--color-muted)] uppercase tracking-wider">Day Pass Spending (YTD)</p>
              {oemDayPasses.map(({ brand, passes, spend }) => {
                // Find matching annual sub
                const annualSub = subscriptions.find(s =>
                  s.oem && brand.toLowerCase().includes(s.oem.toLowerCase()) && s.term === 'yearly'
                )
                const maxSpend = Math.max(...oemDayPasses.map(d => d.spend))
                const barWidth = maxSpend > 0 ? (spend / maxSpend) * 100 : 0

                return (
                  <div key={brand} className="bg-[var(--color-bg)] rounded-lg p-2.5 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium">{brand}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold">{fmt(spend)}</span>
                        <span className="text-[9px] text-[var(--color-muted)]">{passes} passes</span>
                      </div>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#1E293B' }}>
                      <div className="h-full rounded-full" style={{ width: `${barWidth}%`, background: annualSub ? '#22C55E' : '#F59E0B', opacity: 0.7 }} />
                    </div>
                    {annualSub ? (
                      <p className="text-[9px] text-green-400">✓ Annual sub ({fmt(annualSub.cost)}/yr) — saving {fmt(spend > 0 ? spend - (annualSub.cost * (plData.length || 7) / 12) : 0)} vs day pass pace</p>
                    ) : (
                      <p className="text-[9px] text-[var(--color-muted)]">
                        Day pass only · Annualized: ~{fmt(spend * 12 / Math.max(plData.length, 1))}/yr
                        {spend * 12 / Math.max(plData.length, 1) > 800 ? ' ⚠️ Consider annual' : ''}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Annual Subscriptions */}
          {subscriptions.filter(s => s.term === 'yearly' && s.service_line === 'programming').length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] text-[var(--color-muted)] uppercase tracking-wider">Annual Programming Subscriptions</p>
              <div className="grid grid-cols-2 gap-2">
                {subscriptions
                  .filter(s => s.term === 'yearly' && s.service_line === 'programming')
                  .sort((a, b) => b.cost - a.cost)
                  .map(sub => {
                    // Check if we have day pass data for this OEM
                    const dayPassBrand = oemDayPasses.find(d =>
                      sub.oem && d.brand.toLowerCase().includes(sub.oem.toLowerCase())
                    )
                    return (
                      <div key={sub.vendor} className="bg-[var(--color-bg)] rounded-lg p-2 text-xs">
                        <p className="font-medium truncate">{sub.vendor}</p>
                        <p className="font-semibold">{fmt(sub.cost)}/yr</p>
                        {dayPassBrand ? (
                          <p className="text-[9px] text-green-400">$0 day passes ✓</p>
                        ) : (
                          <p className="text-[9px] text-green-400">Unlimited access ✓</p>
                        )}
                      </div>
                    )
                  })}
              </div>
            </div>
          )}

          {/* Total OEM cost summary */}
          {(() => {
            const totalDayPass = oemDayPasses.reduce((s, d) => s + d.spend, 0)
            const totalAnnualSubs = subscriptions.filter(s => s.term === 'yearly' && s.service_line === 'programming').reduce((s, sub) => s + sub.cost, 0)
            const totalMonthly = subscriptions.filter(s => s.term === 'monthly').reduce((s, sub) => s + sub.cost, 0)
            return (
              <div className="bg-[var(--color-bg)] rounded-lg p-3 grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-[9px] text-[var(--color-muted)]">Day Passes YTD</p>
                  <p className="text-xs font-semibold">{fmt(totalDayPass)}</p>
                </div>
                <div>
                  <p className="text-[9px] text-[var(--color-muted)]">Annual Subs</p>
                  <p className="text-xs font-semibold">{fmt(totalAnnualSubs)}/yr</p>
                </div>
                <div>
                  <p className="text-[9px] text-[var(--color-muted)]">Monthly Subs</p>
                  <p className="text-xs font-semibold">{fmt(totalMonthly)}/mo</p>
                </div>
              </div>
            )
          })()}
        </div>
      )}

      {/* ── Section 5: Customers ── */}
      <div className="bg-[var(--color-surface)] rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users size={16} className="text-[var(--color-primary)]" />
            <h2 className="text-sm font-semibold uppercase tracking-wider">Top Customers</h2>
          </div>
          <div className="flex bg-[var(--color-bg)] rounded-lg p-0.5">
            <button onClick={() => setCustPeriod('monthly')} className={`px-3 py-1 text-xs rounded-md min-h-[32px] transition-colors ${custPeriod === 'monthly' ? 'bg-[var(--color-primary)] text-white font-semibold' : 'text-[var(--color-muted)]'}`}>Monthly</button>
            <button onClick={() => setCustPeriod('yearly')} className={`px-3 py-1 text-xs rounded-md min-h-[32px] transition-colors ${custPeriod === 'yearly' ? 'bg-[var(--color-primary)] text-white font-semibold' : 'text-[var(--color-muted)]'}`}>YTD</button>
          </div>
        </div>

        {customerData.length === 0 ? (
          <EmptyState message="No customer data yet" />
        ) : (
          <div className="space-y-1">
            {[...customerData]
              .sort((a, b) => {
                const aRev = custPeriod === 'yearly' ? a.revenue : a.currentMonth
                const bRev = custPeriod === 'yearly' ? b.revenue : b.currentMonth
                return bRev - aRev
              })
              .filter(c => (custPeriod === 'yearly' ? c.revenue : c.currentMonth) > 0)
              .slice(0, 15)
              .map((c, idx) => {
                const periodRevenue = custPeriod === 'yearly' ? c.revenue : c.currentMonth
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
              {plData.length > 0 && (() => {
                const bestMonth = [...plData].sort((a, b) => b.net_income - a.net_income)[0]
                const worstMonth = [...plData].sort((a, b) => a.net_income - b.net_income)[0]
                const bonusMonths = plData.filter(p => p.net_income >= BONUS_FLOOR).length
                return <>
                  <li className="flex items-start gap-2">
                    <span>{avgMonthlyProfit >= OWNER_TAKE_TARGET ? '✅' : '⚠️'}</span>
                    <span>Avg monthly profit: {fmt(avgMonthlyProfit)} — {netMargin > 0 ? `${fmt(netMargin, 'percent')} net margin` : ''}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span>🏆</span>
                    <span>Best month: {new Date(bestMonth.month + '-02').toLocaleString('default', { month: 'long' })} ({fmt(bestMonth.net_income)} profit) · Worst: {new Date(worstMonth.month + '-02').toLocaleString('default', { month: 'long' })} ({fmt(worstMonth.net_income)})</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span>💰</span>
                    <span>Bonus triggered {bonusMonths}/{plData.length} months ({bonusMonths > 0 ? `${((bonusMonths / plData.length) * 100).toFixed(0)}%` : 'none'})</span>
                  </li>
                </>
              })()}
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
