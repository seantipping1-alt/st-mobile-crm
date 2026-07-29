import type { Context } from '@netlify/functions'

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_CALENDAR_API = 'https://www.googleapis.com/calendar/v3'
const KNOWN_TECHS = ['sean', 'steve', 'nooh', 'mike', 'keagan']
const MAX_DRIVE_GAP_HOURS = 2

async function getGoogleToken(clientId: string, clientSecret: string, refreshToken: string): Promise<string> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' }),
  })
  if (!res.ok) throw new Error(`Google token refresh failed: ${await res.text()}`)
  return (await res.json()).access_token
}

// Classify service line from first word of description
function classifyService(description: string): string | null {
  const firstLine = (description || '').split('\n')[0].trim().toLowerCase()
  const firstWord = firstLine.split(/[\s\-]+/)[0]
  if (firstWord.startsWith('pro')) return 'programming'
  if (firstWord.startsWith('dia') || firstWord.startsWith('diag')) return 'diagnostics'
  if (firstWord.startsWith('ada')) return 'adas'
  if (firstWord.startsWith('key')) return 'keys'
  if (firstWord.startsWith('scan')) return 'scantool'
  if (firstWord.startsWith('teach') || firstWord.startsWith('train')) return 'teaching'
  return null // Not a service event
}

// Extract tech name from first line of description
function extractTech(description: string): string | null {
  const firstLine = (description || '').split('\n')[0].trim()
  // Pattern: "Programming Steve" or "Diagnostic- Sean" etc
  const words = firstLine.split(/[\s\-]+/)
  for (const word of words) {
    const lower = word.toLowerCase().replace(/[^a-z]/g, '')
    const match = KNOWN_TECHS.find(t => t === lower)
    if (match) return match.charAt(0).toUpperCase() + match.slice(1) // Capitalize
  }
  return null
}

interface CalEvent {
  summary: string
  description: string
  start: string
  end: string
}

async function fetchCalendarEvents(
  accessToken: string, calendarId: string, timeMin: string, timeMax: string
): Promise<CalEvent[]> {
  const all: CalEvent[] = []
  let pageToken: string | null = null

  while (true) {
    const url = new URL(`${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events`)
    url.searchParams.set('singleEvents', 'true')
    url.searchParams.set('orderBy', 'startTime')
    url.searchParams.set('maxResults', '250')
    url.searchParams.set('timeMin', timeMin)
    url.searchParams.set('timeMax', timeMax)
    if (pageToken) url.searchParams.set('pageToken', pageToken)

    const res = await fetch(url.toString(), {
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' },
    })
    if (!res.ok) throw new Error(`Calendar API error: ${res.status} ${await res.text()}`)

    const data = await res.json()
    for (const event of (data.items || [])) {
      all.push({
        summary: event.summary || '',
        description: event.description || '',
        start: event.start?.dateTime || event.start?.date || '',
        end: event.end?.dateTime || event.end?.date || '',
      })
    }

    pageToken = data.nextPageToken || null
    if (!pageToken) break
  }

  return all
}

export default async (request: Request, _context: Context) => {
  const supabaseUrl = Netlify.env.get('SUPABASE_URL')
  const supabaseKey = Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const clientId = Netlify.env.get('GOOGLE_CLIENT_ID')
  const clientSecret = Netlify.env.get('GOOGLE_CLIENT_SECRET')
  const refreshToken = Netlify.env.get('GOOGLE_REFRESH_TOKEN')
  const calendarId = Netlify.env.get('GOOGLE_CALENDAR_ID')

  if (!supabaseUrl || !supabaseKey || !clientId || !clientSecret || !refreshToken || !calendarId) {
    return new Response(JSON.stringify({ error: 'Missing env vars' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }

  try {
    const body = request.method === 'POST' ? await request.json().catch(() => ({})) : {}

    // Default: sync last 7 days + today
    const now = new Date()
    let startDate: string, endDate: string

    if (body.since && body.until) {
      startDate = body.since
      endDate = body.until
    } else {
      const start = new Date(now)
      start.setDate(start.getDate() - (body.days || 7))
      startDate = start.toISOString().split('T')[0]
      endDate = now.toISOString().split('T')[0]
    }

    const timeMin = `${startDate}T00:00:00Z`
    const timeMax = `${endDate}T23:59:59Z`

    console.log(`Calendar hours sync: ${startDate} to ${endDate}`)

    const accessToken = await getGoogleToken(clientId, clientSecret, refreshToken)
    const events = await fetchCalendarEvents(accessToken, calendarId, timeMin, timeMax)
    console.log(`Fetched ${events.length} calendar events`)

    // Process events into daily hours by tech + service line
    // Structure: { "2026-07-28": { "Steve": { "programming": { hours: X, count: N }, ... }, ... } }
    const dailyData: Record<string, Record<string, Record<string, { hours: number; count: number }>>> = {}

    // Also track per-tech appointment times for drive gap calculation
    // { "2026-07-28": { "Steve": [{ start: Date, end: Date }, ...] } }
    const techAppointments: Record<string, Record<string, { start: Date; end: Date }[]>> = {}

    let classified = 0
    let skipped = 0

    for (const event of events) {
      if (!event.start || !event.end) { skipped++; continue }

      const serviceLine = classifyService(event.description)
      if (!serviceLine) { skipped++; continue } // Not a service event (meeting, admin, etc.)

      const tech = extractTech(event.description)
      if (!tech) { skipped++; continue } // Can't determine tech

      const startTime = new Date(event.start)
      const endTime = new Date(event.end)
      const hours = (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60)

      if (hours <= 0 || hours > 24) { skipped++; continue } // Invalid duration

      const dateKey = startTime.toISOString().split('T')[0]

      // Accumulate hours
      if (!dailyData[dateKey]) dailyData[dateKey] = {}
      if (!dailyData[dateKey][tech]) dailyData[dateKey][tech] = {}
      if (!dailyData[dateKey][tech][serviceLine]) dailyData[dateKey][tech][serviceLine] = { hours: 0, count: 0 }
      dailyData[dateKey][tech][serviceLine].hours += hours
      dailyData[dateKey][tech][serviceLine].count++

      // Track appointments for drive time
      if (!techAppointments[dateKey]) techAppointments[dateKey] = {}
      if (!techAppointments[dateKey][tech]) techAppointments[dateKey][tech] = []
      techAppointments[dateKey][tech].push({ start: startTime, end: endTime })

      classified++
    }

    // Calculate drive time per tech per day (gaps between consecutive appointments <= 2hrs)
    const driveData: Record<string, Record<string, { hours: number; gapCount: number }>> = {}

    for (const [dateKey, techs] of Object.entries(techAppointments)) {
      for (const [tech, appointments] of Object.entries(techs)) {
        // Sort by start time
        const sorted = [...appointments].sort((a, b) => a.start.getTime() - b.start.getTime())

        let totalDriveHours = 0
        let gapCount = 0

        for (let i = 1; i < sorted.length; i++) {
          const prevEnd = sorted[i - 1].end
          const currStart = sorted[i].start
          const gapHours = (currStart.getTime() - prevEnd.getTime()) / (1000 * 60 * 60)

          if (gapHours > 0 && gapHours <= MAX_DRIVE_GAP_HOURS) {
            totalDriveHours += gapHours
            gapCount++
          }
        }

        if (totalDriveHours > 0) {
          if (!driveData[dateKey]) driveData[dateKey] = {}
          driveData[dateKey][tech] = { hours: totalDriveHours, gapCount }
        }
      }
    }

    // Upsert hours into fin_hours
    let hoursUpserted = 0
    const hoursRows: any[] = []

    for (const [dateKey, techs] of Object.entries(dailyData)) {
      for (const [tech, services] of Object.entries(techs)) {
        // Get this tech's drive hours for this day
        const techDrive = driveData[dateKey]?.[tech]
        const totalServiceLines = Object.keys(services).length

        for (const [serviceLine, data] of Object.entries(services)) {
          // Distribute drive time proportionally across service lines
          const driveShare = techDrive ? (techDrive.hours / totalServiceLines) : 0

          hoursRows.push({
            date: dateKey,
            tech_name: tech,
            service_line: serviceLine,
            job_hours: Math.round(data.hours * 100) / 100,
            job_count: data.count,
            drive_hours: Math.round(driveShare * 100) / 100,
            updated_at: new Date().toISOString(),
          })
        }
      }
    }

    // Batch upsert hours (50 at a time)
    for (let i = 0; i < hoursRows.length; i += 50) {
      const chunk = hoursRows.slice(i, i + 50)
      const res = await fetch(`${supabaseUrl}/rest/v1/fin_hours?on_conflict=date,tech_name,service_line`, {
        method: 'POST',
        headers: {
          'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json', 'Prefer': 'return=minimal,resolution=merge-duplicates',
        },
        body: JSON.stringify(chunk),
      })
      if (res.ok) hoursUpserted += chunk.length
      else console.error('Hours upsert error:', await res.text().catch(() => 'unknown'))
    }

    // Upsert drive time into fin_drive_time
    let driveUpserted = 0
    const driveRows: any[] = []

    for (const [dateKey, techs] of Object.entries(driveData)) {
      for (const [tech, data] of Object.entries(techs)) {
        driveRows.push({
          date: dateKey,
          tech_name: tech,
          drive_hours: Math.round(data.hours * 100) / 100,
          gap_count: data.gapCount,
        })
      }
    }

    for (let i = 0; i < driveRows.length; i += 50) {
      const chunk = driveRows.slice(i, i + 50)
      const res = await fetch(`${supabaseUrl}/rest/v1/fin_drive_time?on_conflict=date,tech_name`, {
        method: 'POST',
        headers: {
          'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json', 'Prefer': 'return=minimal,resolution=merge-duplicates',
        },
        body: JSON.stringify(chunk),
      })
      if (res.ok) driveUpserted += chunk.length
      else console.error('Drive upsert error:', await res.text().catch(() => 'unknown'))
    }

    const result = {
      success: true,
      date_range: { from: startDate, to: endDate },
      events_total: events.length,
      events_classified: classified,
      events_skipped: skipped,
      hours_upserted: hoursUpserted,
      drive_records: driveUpserted,
    }

    console.log(`Calendar sync complete: ${classified} classified, ${hoursUpserted} hours rows, ${driveUpserted} drive records`)

    return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } })

  } catch (error: any) {
    console.error('Calendar hours sync error:', error)
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}
