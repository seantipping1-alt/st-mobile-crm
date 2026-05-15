import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Calendar, Plus, MapPin, User, Wrench, Car, RefreshCw, AlertCircle } from 'lucide-react'
import { fetchCalendarEvents, parseCalendarEvent, getTodayRange, getWeekRange, serviceTypeToJobType, type ParsedEvent } from '../lib/calendar'
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

function formatTime(isoString: string): string {
  try {
    const d = new Date(isoString)
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  } catch {
    return ''
  }
}

function formatDateLabel(isoString: string): string {
  try {
    const d = new Date(isoString)
    const today = new Date()
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    if (d.toDateString() === today.toDateString()) return 'Today'
    if (d.toDateString() === tomorrow.toDateString()) return 'Tomorrow'
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  } catch {
    return ''
  }
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const [events, setEvents] = useState<ParsedEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<'today' | 'week'>('today')
  const [jobCount, setJobCount] = useState({ today: 0, inProgress: 0, unpaid: 0 })
  const [linkedEventIds, setLinkedEventIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    loadEvents()
    loadStats()
  }, [view])

  async function loadEvents() {
    setLoading(true)
    setError(null)
    try {
      const range = view === 'today' ? getTodayRange() : getWeekRange()
      const raw = await fetchCalendarEvents(range.timeMin, range.timeMax)
      const parsed = raw.map(parseCalendarEvent)
      setEvents(parsed)

      // Check which events already have jobs linked (by gcal_event_id)
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
    // Build pre-fill state and pass via navigation
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

  // Group events by date for week view
  const eventsByDate: Record<string, ParsedEvent[]> = {}
  events.forEach((e) => {
    const dateKey = e.startTime ? new Date(e.startTime).toDateString() : 'Unknown'
    if (!eventsByDate[dateKey]) eventsByDate[dateKey] = []
    eventsByDate[dateKey].push(e)
  })

  const jobEvents = events.filter(e => e.isJob)
  const nonJobEvents = events.filter(e => !e.isJob)

  return (
    <div className="p-4 md:p-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold">Schedule</h1>
        <div className="flex items-center gap-2">
          <div className="flex bg-[var(--color-surface)] rounded-lg overflow-hidden">
            <button onClick={() => setView('today')}
              className={`px-3 py-1.5 text-sm font-medium transition ${view === 'today' ? 'bg-[var(--color-primary)] text-white' : 'text-[var(--color-muted)] hover:text-white'}`}>
              Today
            </button>
            <button onClick={() => setView('week')}
              className={`px-3 py-1.5 text-sm font-medium transition ${view === 'week' ? 'bg-[var(--color-primary)] text-white' : 'text-[var(--color-muted)] hover:text-white'}`}>
              Week
            </button>
          </div>
          <button onClick={loadEvents}
            className="text-[var(--color-muted)] hover:text-white p-2 transition min-h-[44px] min-w-[44px] flex items-center justify-center">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
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
          {jobEvents.length === 0 && (
            <div className="bg-[var(--color-surface)] rounded-lg p-8 text-center">
              <Calendar size={24} className="mx-auto text-[var(--color-muted)] mb-2" />
              <p className="text-[var(--color-muted)] text-sm">No jobs on the calendar {view === 'today' ? 'today' : 'this week'}</p>
            </div>
          )}

          {view === 'today' ? (
            <div className="space-y-3">
              {jobEvents.map((parsed) => (
                <EventCard key={parsed.raw.id} parsed={parsed} onCreateJob={handleCreateJob} isLinked={linkedEventIds.has(parsed.raw.id)} />
              ))}
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(eventsByDate).map(([dateStr, dayEvents]) => {
                const dayJobs = dayEvents.filter(e => e.isJob)
                if (dayJobs.length === 0) return null
                return (
                  <div key={dateStr}>
                    <h2 className="text-sm font-medium text-[var(--color-muted)] mb-2">
                      {formatDateLabel(dayJobs[0].startTime)}
                      <span className="text-xs ml-2 opacity-60">{dayJobs.length} job{dayJobs.length !== 1 ? 's' : ''}</span>
                    </h2>
                    <div className="space-y-3">
                      {dayJobs.map((parsed) => (
                        <EventCard key={parsed.raw.id} parsed={parsed} onCreateJob={handleCreateJob} isLinked={linkedEventIds.has(parsed.raw.id)} />
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Non-job events (meetings etc) */}
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

function EventCard({ parsed, onCreateJob, isLinked }: { parsed: ParsedEvent; onCreateJob: (p: ParsedEvent) => void; isLinked: boolean }) {
  const jobType = serviceTypeToJobType(parsed.serviceType)
  const typeColor = JOB_TYPE_COLORS[jobType] || JOB_TYPE_COLORS.other
  const typeLabel = JOB_TYPE_LABELS[jobType] || 'Other'

  return (
    <div className="bg-[var(--color-surface)] rounded-lg overflow-hidden">
      {/* Color bar */}
      <div className="h-1" style={{ backgroundColor: typeColor }} />

      <div className="p-4">
        {/* Header row */}
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

        {/* Details grid */}
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

        {/* Action */}
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
