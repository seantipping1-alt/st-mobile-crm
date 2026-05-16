import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Calendar, Plus, MapPin, User, Wrench, Car, RefreshCw, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react'
import { fetchCalendarEvents, parseCalendarEvent, getDayRange, getWeekRangeForDate, serviceTypeToJobType, type ParsedEvent } from '../lib/calendar'
import { getJobs } from '../lib/db'

const JOB_TYPE_COLORS: Record<string, string> = {
  diagnostic: '#F97316',
  programming: '#3B82F6',
  adas: '#10B981',
  keys: '#EAB308',
  other: '#6B7280',
}

const JOB_TYPE_LABELS: Record<string, string> = {
  diagnostic: 'Diagnostic',
  programming: 'Programming',
  adas: 'ADAS',
  keys: 'Keys',
  other: 'Other',
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function formatTime(isoString: string): string {
  try {
    const d = new Date(isoString)
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  } catch {
    return ''
  }
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function formatDayHeader(date: Date): string {
  const today = new Date()
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  if (isSameDay(date, today)) return 'Today'
  if (isSameDay(date, tomorrow)) return 'Tomorrow'
  if (isSameDay(date, yesterday)) return 'Yesterday'
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
}

function formatWeekHeader(date: Date): string {
  // Get Monday of the week
  const d = new Date(date)
  const dayOfWeek = d.getDay()
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
  const monday = new Date(d)
  monday.setDate(d.getDate() + mondayOffset)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)

  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
  return `${monday.toLocaleDateString('en-US', opts)} – ${sunday.toLocaleDateString('en-US', opts)}`
}

function getMonday(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const dayOfWeek = d.getDay()
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
  d.setDate(d.getDate() + mondayOffset)
  return d
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const [events, setEvents] = useState<ParsedEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<'day' | 'week'>('day')
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [jobCount, setJobCount] = useState({ today: 0, inProgress: 0, unpaid: 0 })
  const [linkedEventIds, setLinkedEventIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    loadEvents()
  }, [view, selectedDate])

  useEffect(() => {
    loadStats()
  }, [])

  async function loadEvents() {
    setLoading(true)
    setError(null)
    try {
      const range = view === 'day' ? getDayRange(selectedDate) : getWeekRangeForDate(selectedDate)
      const raw = await fetchCalendarEvents(range.timeMin, range.timeMax)
      const parsed = raw.map(parseCalendarEvent)
      setEvents(parsed)

      const jobs = await getJobs()
      const linked = new Set((jobs || []).filter((j: any) => j.gcal_event_id).map((j: any) => j.gcal_event_id as string))
      setLinkedEventIds(linked)
    } catch (err: any) {
      console.error('Failed to load calendar:', err)
      setError(err.message || 'Failed to load calendar events')
    }
    setLoading(false)
  }

  async function loadStats() {
    try {
      const jobs = await getJobs()
      if (!jobs) return
      const today = new Date().toDateString()
      setJobCount({
        today: jobs.filter((j: any) => j.scheduled_start && new Date(j.scheduled_start).toDateString() === today).length,
        inProgress: jobs.filter((j: any) => j.status === 'in_progress').length,
        unpaid: jobs.filter((j: any) => j.status === 'invoiced').length,
      })
    } catch {}
  }

  function handleCreateJob(parsed: ParsedEvent) {
    const prefill = {
      gcal_event_id: parsed.raw.id,
      shop_name: parsed.shopName || '',
      job_type: serviceTypeToJobType(parsed.serviceType),
      tech_name: parsed.techName || '',
      vehicle_year: parsed.vehicleYear || '',
      vehicle_make: parsed.vehicleMake || '',
      vehicle_model: parsed.vehicleModel || '',
      vin: parsed.vin || '',
      vehicles: parsed.vehicles,
      scheduled_start: parsed.startTime || '',
      scheduled_end: parsed.endTime || '',
      address_street: parsed.address.street || '',
      address_city: parsed.address.city || '',
      address_state: parsed.address.state || '',
      address_zip: parsed.address.zip || '',
      job_description: [parsed.jobNote, parsed.details].filter(Boolean).join('\n'),
      location_name: parsed.shopName || '',
    }
    navigate('/jobs/new', { state: { calendarPrefill: prefill } })
  }

  function navigateDay(offset: number) {
    const d = new Date(selectedDate)
    d.setDate(d.getDate() + offset)
    setSelectedDate(d)
  }

  function navigateWeek(offset: number) {
    const d = new Date(selectedDate)
    d.setDate(d.getDate() + offset * 7)
    setSelectedDate(d)
  }

  function goToDay(date: Date) {
    setSelectedDate(date)
    setView('day')
  }

  function goToToday() {
    setSelectedDate(new Date())
  }

  // Build week days for week view
  const monday = getMonday(selectedDate)
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d
  })

  // Group events by date for week view
  const eventsByDateKey: Record<string, ParsedEvent[]> = {}
  events.forEach((e) => {
    const dateKey = e.startTime ? new Date(e.startTime).toDateString() : ''
    if (!dateKey) return
    if (!eventsByDateKey[dateKey]) eventsByDateKey[dateKey] = []
    eventsByDateKey[dateKey].push(e)
  })

  const jobEvents = events.filter(e => e.isJob)
  const nonJobEvents = events.filter(e => !e.isJob)
  const isToday = isSameDay(selectedDate, new Date())

  return (
    <div className="p-4 md:p-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">Schedule</h1>
        <div className="flex items-center gap-2">
          <div className="flex bg-[var(--color-surface)] rounded-lg overflow-hidden">
            <button onClick={() => setView('day')}
              className={`px-3 py-1.5 text-sm font-medium transition min-h-[44px] ${view === 'day' ? 'bg-[var(--color-primary)] text-white' : 'text-[var(--color-muted)] hover:text-white'}`}>
              Day
            </button>
            <button onClick={() => setView('week')}
              className={`px-3 py-1.5 text-sm font-medium transition min-h-[44px] ${view === 'week' ? 'bg-[var(--color-primary)] text-white' : 'text-[var(--color-muted)] hover:text-white'}`}>
              Week
            </button>
          </div>
          <button onClick={loadEvents}
            className="text-[var(--color-muted)] hover:text-white p-2 transition min-h-[44px] min-w-[44px] flex items-center justify-center">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Day/Week navigation */}
      <div className="flex items-center justify-between mb-4 bg-[var(--color-surface)] rounded-lg px-2 py-1">
        <button onClick={() => view === 'day' ? navigateDay(-1) : navigateWeek(-1)}
          className="text-[var(--color-muted)] hover:text-white p-2 min-h-[44px] min-w-[44px] flex items-center justify-center">
          <ChevronLeft size={20} />
        </button>
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-white">
            {view === 'day' ? formatDayHeader(selectedDate) : formatWeekHeader(selectedDate)}
          </span>
          {!isToday && (
            <button onClick={goToToday}
              className="text-xs text-[var(--color-primary)] hover:underline min-h-[44px] flex items-center">
              Today
            </button>
          )}
        </div>
        <button onClick={() => view === 'day' ? navigateDay(1) : navigateWeek(1)}
          className="text-[var(--color-muted)] hover:text-white p-2 min-h-[44px] min-w-[44px] flex items-center justify-center">
          <ChevronRight size={20} />
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: 'Jobs Today', value: jobCount.today },
          { label: 'In Progress', value: jobCount.inProgress },
          { label: 'Unpaid Invoices', value: jobCount.unpaid },
        ].map((stat) => (
          <div key={stat.label} className="bg-[var(--color-surface)] rounded-lg p-3 md:p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{stat.label}</p>
            <p className="text-xl md:text-2xl font-bold">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Error state */}
      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 mb-4 flex items-start gap-3">
          <AlertCircle size={18} className="text-red-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-red-300 text-sm font-medium">Calendar sync error</p>
            <p className="text-red-400/70 text-xs mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="bg-[var(--color-surface)] rounded-lg p-8 text-center">
          <RefreshCw size={20} className="animate-spin mx-auto text-[var(--color-muted)] mb-2" />
          <p className="text-[var(--color-muted)] text-sm">Loading calendar...</p>
        </div>
      )}

      {/* Calendar events */}
      {!loading && !error && (
        <>
          {view === 'day' ? (
            <>
              {jobEvents.length === 0 && (
                <div className="bg-[var(--color-surface)] rounded-lg p-8 text-center">
                  <Calendar size={24} className="mx-auto text-[var(--color-muted)] mb-2" />
                  <p className="text-[var(--color-muted)] text-sm">No jobs on {formatDayHeader(selectedDate).toLowerCase()}</p>
                </div>
              )}
              <div className="space-y-3">
                {jobEvents.map((parsed) => (
                  <EventCard key={parsed.raw.id} parsed={parsed} onCreateJob={handleCreateJob} isLinked={linkedEventIds.has(parsed.raw.id)} />
                ))}
              </div>
            </>
          ) : (
            /* Week view — column per day */
            <div className="space-y-0">
              {/* Desktop: grid of day columns */}
              <div className="hidden md:grid md:grid-cols-7 gap-2">
                {weekDays.map((day, i) => {
                  const dayKey = day.toDateString()
                  const dayEvents = (eventsByDateKey[dayKey] || []).filter(e => e.isJob)
                  const isCurrentDay = isSameDay(day, new Date())

                  return (
                    <div key={i} className="flex flex-col">
                      <button
                        onClick={() => goToDay(day)}
                        className={`text-center py-2 rounded-t-lg transition hover:bg-white/5 ${isCurrentDay ? 'bg-[var(--color-primary)]/20' : ''}`}
                      >
                        <p className={`text-xs font-medium ${isCurrentDay ? 'text-[var(--color-primary)]' : 'text-[var(--color-muted)]'}`}>
                          {DAY_NAMES[i]}
                        </p>
                        <p className={`text-lg font-bold ${isCurrentDay ? 'text-[var(--color-primary)]' : 'text-white'}`}>
                          {day.getDate()}
                        </p>
                      </button>
                      <div className="bg-[var(--color-surface)] rounded-b-lg flex-1 p-1.5 space-y-1.5 min-h-[120px]">
                        {dayEvents.length === 0 && (
                          <p className="text-[var(--color-muted)] text-[10px] text-center py-4 opacity-50">No jobs</p>
                        )}
                        {dayEvents.map((parsed) => (
                          <WeekEventCard
                            key={parsed.raw.id}
                            parsed={parsed}
                            onCreateJob={handleCreateJob}
                            isLinked={linkedEventIds.has(parsed.raw.id)}
                          />
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Mobile: stacked day rows */}
              <div className="md:hidden space-y-2">
                {weekDays.map((day, i) => {
                  const dayKey = day.toDateString()
                  const dayEvents = (eventsByDateKey[dayKey] || []).filter(e => e.isJob)
                  const isCurrentDay = isSameDay(day, new Date())

                  return (
                    <div key={i} className="bg-[var(--color-surface)] rounded-lg overflow-hidden">
                      <button
                        onClick={() => goToDay(day)}
                        className={`w-full flex items-center justify-between px-4 py-3 transition hover:bg-white/5 ${isCurrentDay ? 'bg-[var(--color-primary)]/10' : ''}`}
                      >
                        <div className="flex items-center gap-3">
                          <span className={`text-sm font-medium ${isCurrentDay ? 'text-[var(--color-primary)]' : 'text-white'}`}>
                            {DAY_NAMES[i]}
                          </span>
                          <span className={`text-sm ${isCurrentDay ? 'text-[var(--color-primary)]' : 'text-[var(--color-muted)]'}`}>
                            {day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {dayEvents.length > 0 && (
                            <span className="text-xs text-[var(--color-muted)]">{dayEvents.length} job{dayEvents.length !== 1 ? 's' : ''}</span>
                          )}
                          <ChevronRight size={16} className="text-[var(--color-muted)]" />
                        </div>
                      </button>
                      {dayEvents.length > 0 && (
                        <div className="px-3 pb-3 space-y-1.5">
                          {dayEvents.map((parsed) => (
                            <WeekEventCard
                              key={parsed.raw.id}
                              parsed={parsed}
                              onCreateJob={handleCreateJob}
                              isLinked={linkedEventIds.has(parsed.raw.id)}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Non-job events */}
          {nonJobEvents.length > 0 && (
            <div className="mt-6">
              <h2 className="text-sm font-medium text-[var(--color-muted)] mb-2">Other Events</h2>
              <div className="space-y-2">
                {nonJobEvents.map((parsed) => (
                  <div key={parsed.raw.id} className="bg-[var(--color-surface)] rounded-lg px-4 py-3 flex items-center gap-3">
                    <Calendar size={14} className="text-[var(--color-muted)] flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">{parsed.raw.summary}</p>
                      {parsed.startTime && (
                        <p className="text-xs text-[var(--color-muted)]">{formatTime(parsed.startTime)}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

/* Full event card for day view */
function EventCard({ parsed, onCreateJob, isLinked }: { parsed: ParsedEvent; onCreateJob: (p: ParsedEvent) => void; isLinked: boolean }) {
  const jobType = serviceTypeToJobType(parsed.serviceType)
  const typeColor = JOB_TYPE_COLORS[jobType] || JOB_TYPE_COLORS.other
  const typeLabel = JOB_TYPE_LABELS[jobType] || 'Other'

  return (
    <div className="bg-[var(--color-surface)] rounded-lg overflow-hidden">
      <div className="h-1" style={{ backgroundColor: typeColor }} />
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-medium text-white truncate">{parsed.shopName || parsed.raw.summary}</h3>
            {parsed.startTime && (
              <p className="text-xs text-[var(--color-muted)]">
                {formatTime(parsed.startTime)}
                {parsed.endTime && ` – ${formatTime(parsed.endTime)}`}
              </p>
            )}
          </div>
          <span className="text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: `${typeColor}20`, color: typeColor }}>
            {typeLabel}
          </span>
        </div>

        <div className="space-y-1.5 mb-3">
          {parsed.vehicles.length > 0 ? (
            parsed.vehicles.map((v, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <Car size={12} className="text-[var(--color-muted)] flex-shrink-0" />
                <span className="text-white">
                  {[v.year, v.make, v.model].filter(Boolean).join(' ') || 'Vehicle'}
                </span>
                {v.vin && <span className="text-[var(--color-muted)] font-mono text-[10px]">{v.vin}</span>}
              </div>
            ))
          ) : parsed.vehicleText ? (
            <div className="flex items-center gap-2 text-xs">
              <Car size={12} className="text-[var(--color-muted)] flex-shrink-0" />
              <span className="text-white">
                {parsed.vehicleYear && parsed.vehicleMake
                  ? `${parsed.vehicleYear} ${parsed.vehicleMake} ${parsed.vehicleModel || ''}`
                  : parsed.vehicleText}
              </span>
              {parsed.vin && <span className="text-[var(--color-muted)] font-mono text-[10px]">{parsed.vin}</span>}
            </div>
          ) : null}
          {parsed.techName && (
            <div className="flex items-center gap-2 text-xs">
              <User size={12} className="text-[var(--color-muted)] flex-shrink-0" />
              <span className="text-white">{parsed.techName}</span>
            </div>
          )}
          {parsed.address.full && (
            <div className="flex items-center gap-2 text-xs">
              <MapPin size={12} className="text-[var(--color-muted)] flex-shrink-0" />
              <span className="text-[var(--color-muted)] truncate">{parsed.address.street ? `${parsed.address.street}, ${parsed.address.city}` : parsed.address.full}</span>
            </div>
          )}
          {parsed.details && (
            <div className="flex items-start gap-2 text-xs">
              <Wrench size={12} className="text-[var(--color-muted)] flex-shrink-0 mt-0.5" />
              <span className="text-[var(--color-muted)] line-clamp-2">{parsed.details}</span>
            </div>
          )}
        </div>

        {isLinked ? (
          <div className="flex items-center gap-1.5 text-xs text-green-400">
            <span>✓ Job created</span>
          </div>
        ) : (
          <button onClick={() => onCreateJob(parsed)}
            className="w-full flex items-center justify-center gap-2 bg-[var(--color-primary)]/10 hover:bg-[var(--color-primary)]/20 text-[var(--color-primary)] rounded-lg py-2 text-sm font-medium transition min-h-[44px]">
            <Plus size={14} />
            Create Job
          </button>
        )}
      </div>
    </div>
  )
}

/* Compact event card for week view */
function WeekEventCard({ parsed, onCreateJob, isLinked }: { parsed: ParsedEvent; onCreateJob: (p: ParsedEvent) => void; isLinked: boolean }) {
  const jobType = serviceTypeToJobType(parsed.serviceType)
  const typeColor = JOB_TYPE_COLORS[jobType] || JOB_TYPE_COLORS.other

  return (
    <div
      className="rounded overflow-hidden cursor-pointer hover:brightness-110 transition"
      onClick={() => { if (!isLinked) onCreateJob(parsed) }}
    >
      <div className="h-0.5" style={{ backgroundColor: typeColor }} />
      <div className="bg-[var(--color-bg)] px-2 py-1.5">
        <p className="text-xs text-white truncate font-medium">{parsed.shopName || parsed.raw.summary}</p>
        {parsed.startTime && (
          <p className="text-[10px] text-[var(--color-muted)]">{formatTime(parsed.startTime)}</p>
        )}
        {parsed.vehicles.length > 0 ? (
          <p className="text-[10px] text-[var(--color-muted)] truncate">
            {parsed.vehicles.map(v => [v.year, v.make].filter(Boolean).join(' ')).join(', ')}
          </p>
        ) : parsed.vehicleText ? (
          <p className="text-[10px] text-[var(--color-muted)] truncate">
            {parsed.vehicleYear && parsed.vehicleMake
              ? `${parsed.vehicleYear} ${parsed.vehicleMake}`
              : parsed.vehicleText}
          </p>
        ) : null}
        {isLinked ? (
          <p className="text-[10px] text-green-400 mt-0.5">✓ Job created</p>
        ) : (
          <p className="text-[10px] text-[var(--color-primary)] mt-0.5 flex items-center gap-0.5">
            <Plus size={8} /> Create Job
          </p>
        )}
      </div>
    </div>
  )
}
