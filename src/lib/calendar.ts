// ─── Google Calendar Event Parser ─────────────────────────
// Parses ST Mobile calendar events into structured job data

export interface CalendarEvent {
  id: string
  summary: string
  description: string
  location: string
  start: string
  end: string
  colorId: string | null
  htmlLink: string
}

export interface ParsedEvent {
  raw: CalendarEvent
  isJob: boolean
  shopName: string | null
  vehicleText: string | null
  vehicleYear: string | null
  vehicleMake: string | null
  vehicleModel: string | null
  jobNote: string | null
  serviceType: string | null
  techName: string | null
  vin: string | null
  details: string | null
  address: {
    full: string | null
    street: string | null
    city: string | null
    state: string | null
    zip: string | null
  }
  startTime: string
  endTime: string
}

// GCal color IDs → tech mapping (these are Google Calendar's internal colorId values)
// Google Calendar color IDs: 1=Lavender, 2=Sage, 3=Grape, 4=Flamingo, 5=Banana,
// 6=Tangerine, 7=Peacock, 8=Graphite, 9=Blueberry, 10=Basil, 11=Tomato
const GCAL_COLOR_TO_TECH: Record<string, string> = {
  '5': 'Sean',       // Banana (yellow)
  '8': 'Steve',      // Graphite (gray)
  '6': 'Nooh',       // Tangerine
  '3': 'Keagan',     // Grape
  '9': 'Mike',       // Blueberry (blue)
}

// Known service type keywords
const SERVICE_TYPE_MAP: Record<string, string> = {
  'programming': 'programming',
  'program': 'programming',
  'diagnostic': 'diagnostic',
  'diagnostics': 'diagnostic',
  'diag': 'diagnostic',
  'adas': 'adas',
  'calibration': 'adas',
  'key': 'keys',
  'keys': 'keys',
}

// Known tech names for fuzzy matching
const KNOWN_TECHS = ['Sean', 'Mike', 'Steve', 'Nooh', 'Keagan']

function fuzzyMatchTech(name: string): string | null {
  if (!name) return null
  const lower = name.toLowerCase().trim()
  // Exact match first
  const exact = KNOWN_TECHS.find(t => t.toLowerCase() === lower)
  if (exact) return exact
  // Starts-with match
  const starts = KNOWN_TECHS.find(t => t.toLowerCase().startsWith(lower) || lower.startsWith(t.toLowerCase()))
  if (starts) return starts
  // Fuzzy — Levenshtein-ish: check if within 2 chars edit distance
  for (const tech of KNOWN_TECHS) {
    if (Math.abs(tech.length - name.length) <= 2 && tech.toLowerCase().slice(0, 3) === lower.slice(0, 3)) {
      return tech
    }
  }
  return null
}

// Parse title format: "[Shop Name]- [Year Make Model] [job note]"
function parseTitle(summary: string): {
  shopName: string | null
  vehicleText: string | null
  vehicleYear: string | null
  vehicleMake: string | null
  vehicleModel: string | null
  jobNote: string | null
  isJob: boolean
} {
  // Look for the separator pattern: "- " or "-" between shop and vehicle
  const sepMatch = summary.match(/^(.+?)\s*-\s*(.+)$/)
  if (!sepMatch) {
    return { shopName: null, vehicleText: null, vehicleYear: null, vehicleMake: null, vehicleModel: null, jobNote: null, isJob: false }
  }

  const shopName = sepMatch[1].trim()
  const rest = sepMatch[2].trim()

  // Try to extract year from rest
  const yearMatch = rest.match(/\b(19|20)\d{2}\b/)
  if (!yearMatch) {
    // No year found — might be a multi-vehicle or non-standard event, still treat as job
    return { shopName, vehicleText: rest, vehicleYear: null, vehicleMake: null, vehicleModel: null, jobNote: rest, isJob: true }
  }

  const year = yearMatch[0]
  const afterYear = rest.slice(rest.indexOf(year) + year.length).trim()

  // After year: "Make Model [job note]"
  // Split into words — first word is make, then model words until we hit lowercase job note words
  const words = afterYear.split(/\s+/)
  const make = words[0] || null
  let model: string | null = null
  let jobNote: string | null = null

  if (words.length > 1) {
    // Model is typically one word, but can be two (e.g., "Grand Cherokee")
    // Job note tends to be lowercase or describe the work
    let modelWords: string[] = []
    let noteStart = -1
    for (let i = 1; i < words.length; i++) {
      // If the word looks like a job description (common service words), start the note
      const w = words[i].toLowerCase()
      if (['tcm', 'bcm', 'pcm', 'ecm', 'new', 'reman', 'replace', 'swap', 'program', 'programming',
           'calibration', 'diagnostic', 'diag', 'key', 'remote', 'update', 'reflash', 'have', 'has',
           'transmission', 'engine', 'module', 'airbag', 'abs', 'srs'].includes(w)) {
        noteStart = i
        break
      }
      modelWords.push(words[i])
    }
    model = modelWords.join(' ') || null
    if (noteStart >= 0) {
      jobNote = words.slice(noteStart).join(' ')
    }
  }

  return {
    shopName,
    vehicleText: rest,
    vehicleYear: year,
    vehicleMake: make,
    vehicleModel: model,
    jobNote,
    isJob: true,
  }
}

// Parse location: "Shop Name\nStreet, City, State ZIP, USA" or "Shop Name, Street, City, State ZIP, USA"
function parseLocation(location: string): {
  shopName: string | null
  street: string | null
  city: string | null
  state: string | null
  zip: string | null
  full: string | null
} {
  if (!location) return { shopName: null, street: null, city: null, state: null, zip: null, full: null }

  // Google Maps location format varies — sometimes it's just the address, sometimes shop name is first
  // Pattern: "Shop Name, 123 Street, City, ST 12345, USA"
  const parts = location.split(',').map(p => p.trim())

  if (parts.length >= 4) {
    // Likely: [Shop Name, Street, City, "ST ZIP", "USA"] or [Shop Name, Street, City, "ST ZIP USA"]
    const shopName = parts[0]
    const street = parts[1]
    const city = parts[2]
    // State + ZIP is usually in parts[3]
    const stateZipMatch = parts[3].match(/([A-Z]{2})\s+(\d{5})/)
    const state = stateZipMatch ? stateZipMatch[1] : null
    const zip = stateZipMatch ? stateZipMatch[2] : null

    return { shopName, street, city, state, zip, full: location }
  }

  return { shopName: null, street: null, city: null, state: null, zip: null, full: location }
}

// Parse description: first line = "[ServiceType] [TechName]", rest = details with possible VIN
function parseDescription(description: string): {
  serviceType: string | null
  techName: string | null
  vin: string | null
  details: string | null
} {
  if (!description) return { serviceType: null, techName: null, vin: null, details: null }

  const lines = description.split('\n').map(l => l.trim()).filter(Boolean)
  if (lines.length === 0) return { serviceType: null, techName: null, vin: null, details: null }

  // First line: "Programming Steve" or "Diagnostic Nooh"
  const firstLine = lines[0]
  const firstWords = firstLine.split(/\s+/)

  let serviceType: string | null = null
  let techName: string | null = null

  if (firstWords.length >= 1) {
    const svcKey = firstWords[0].toLowerCase()
    serviceType = SERVICE_TYPE_MAP[svcKey] || null
  }

  if (firstWords.length >= 2) {
    techName = fuzzyMatchTech(firstWords[1])
  }

  // Extract VIN from full description — 17-char alphanumeric
  const fullText = description
  const vinMatch = fullText.match(/\b[A-HJ-NPR-Z0-9]{17}\b/i)
  const vin = vinMatch ? vinMatch[0].toUpperCase() : null

  // Details = everything after first line
  const details = lines.slice(1).join('\n').trim() || null

  return { serviceType, techName, vin, details }
}

export function parseCalendarEvent(event: CalendarEvent): ParsedEvent {
  const title = parseTitle(event.summary)
  const loc = parseLocation(event.location)
  const desc = parseDescription(event.description)

  // Use location shop name if available (more accurate), fall back to title
  const shopName = loc.shopName || title.shopName

  // Tech from description, with color as fallback/confirmation
  const colorTech = event.colorId ? GCAL_COLOR_TO_TECH[event.colorId] : null
  const techName = desc.techName || colorTech

  return {
    raw: event,
    isJob: title.isJob,
    shopName,
    vehicleText: title.vehicleText,
    vehicleYear: title.vehicleYear,
    vehicleMake: title.vehicleMake,
    vehicleModel: title.vehicleModel,
    jobNote: title.jobNote,
    serviceType: desc.serviceType,
    techName,
    vin: desc.vin,
    details: desc.details,
    address: {
      full: loc.full,
      street: loc.street,
      city: loc.city,
      state: loc.state,
      zip: loc.zip,
    },
    startTime: event.start,
    endTime: event.end,
  }
}

// ─── API Client ────────────────────────────────────────────

export async function fetchCalendarEvents(timeMin: string, timeMax: string): Promise<CalendarEvent[]> {
  const params = new URLSearchParams({ timeMin, timeMax })
  const response = await fetch(`/api/calendar?${params}`)
  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.error || `Calendar fetch failed: ${response.status}`)
  }
  const data = await response.json()
  return data.events || []
}

export function getTodayRange(): { timeMin: string; timeMax: string } {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0)
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)
  return {
    timeMin: start.toISOString(),
    timeMax: end.toISOString(),
  }
}

export function getWeekRange(): { timeMin: string; timeMax: string } {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 7)
  return {
    timeMin: start.toISOString(),
    timeMax: end.toISOString(),
  }
}

// Map parsed service type to CRM job_type
export function serviceTypeToJobType(serviceType: string | null): string {
  if (!serviceType) return 'other'
  const map: Record<string, string> = {
    programming: 'programming',
    diagnostic: 'diagnostic',
    adas: 'adas',
    keys: 'keys',
  }
  return map[serviceType] || 'other'
}
