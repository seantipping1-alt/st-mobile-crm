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

export interface ParsedVehicle {
  year: string | null
  make: string | null
  model: string | null
  vin: string | null
  note: string | null
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
  vehicles: ParsedVehicle[]
  isMultiVehicle: boolean
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
  isMultiVehicle: boolean
  multiVehicleCount: number
} {
  // Look for the separator pattern: "- " or "-" between shop and vehicle
  const sepMatch = summary.match(/^(.+?)\s*-\s*(.+)$/)
  if (!sepMatch) {
    return { shopName: null, vehicleText: null, vehicleYear: null, vehicleMake: null, vehicleModel: null, jobNote: null, isJob: false, isMultiVehicle: false, multiVehicleCount: 0 }
  }

  const shopName = sepMatch[1].trim()
  const rest = sepMatch[2].trim()

  // Check for multi-vehicle indicator: "X2", "X3", "x2", etc.
  const multiMatch = rest.match(/^[Xx](\d+)$/)
  if (multiMatch) {
    return { shopName, vehicleText: rest, vehicleYear: null, vehicleMake: null, vehicleModel: null, jobNote: null, isJob: true, isMultiVehicle: true, multiVehicleCount: parseInt(multiMatch[1]) }
  }

  // Try to extract year from rest
  const yearMatch = rest.match(/\b(19|20)\d{2}\b/)
  if (!yearMatch) {
    // No year found — might be a multi-vehicle or non-standard event, still treat as job
    return { shopName, vehicleText: rest, vehicleYear: null, vehicleMake: null, vehicleModel: null, jobNote: rest, isJob: true, isMultiVehicle: false, multiVehicleCount: 0 }
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
    isMultiVehicle: false,
    multiVehicleCount: 0,
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
  vehicles: ParsedVehicle[]
} {
  if (!description) return { serviceType: null, techName: null, vin: null, details: null, vehicles: [] }

  const lines = description.split('\n').map(l => l.trim()).filter(Boolean)
  if (lines.length === 0) return { serviceType: null, techName: null, vin: null, details: null, vehicles: [] }

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

  // Extract ALL VINs from full description — 17-char alphanumeric
  const fullText = description
  const vinMatches = [...fullText.matchAll(/\b[A-HJ-NPR-Z0-9]{17}\b/gi)]
  const vins = vinMatches.map(m => m[0].toUpperCase())
  const vin = vins[0] || null

  // Extract vehicles from description body
  // Patterns: "2010 Volvo XC 70 has air bag codes" or "Vehicle: 2014 acura rlx" or "Vehicle (Y/M/M): 2012 gmc acadia"
  const vehicles: ParsedVehicle[] = []
  const detailLines = lines.slice(1)
  const vehiclePatterns = [
    // "Vehicle: 2014 acura rlx" or "Vehicle (Y/M/M): 2012 gmc acadia"
    /vehicle[^:]*:\s*(\d{4})\s+(\S+)\s+(.+)/i,
    // Standalone year-make-model at start of a line: "2010 Volvo XC 70..."
    /^(\d{4})\s+([A-Za-z]+)\s+([A-Za-z0-9 ]+?)(?:\s+(?:has|needs|with|vin|reman|new|used|—|-|$))/i,
  ]

  // Also look for free-form "YYYY Make Model" lines
  for (const line of detailLines) {
    for (const pattern of vehiclePatterns) {
      const match = line.match(pattern)
      if (match) {
        const vYear = match[1]
        const vMake = match[2]
        const vModel = match[3]?.trim().replace(/\s+(has|needs|with|vin|reman|new|used).*$/i, '') || null
        // Check if we already have this vehicle
        const isDupe = vehicles.some(v => v.year === vYear && v.make?.toLowerCase() === vMake.toLowerCase())
        if (!isDupe) {
          // Try to find a VIN near this vehicle mention
          const lineIdx = description.indexOf(line)
          const nearbyText = description.slice(lineIdx, lineIdx + 300)
          const nearbyVin = nearbyText.match(/\b[A-HJ-NPR-Z0-9]{17}\b/i)
          vehicles.push({
            year: vYear,
            make: vMake,
            model: vModel,
            vin: nearbyVin ? nearbyVin[0].toUpperCase() : null,
            note: null,
          })
        }
        break
      }
    }
  }

  // Details = everything after first line
  const details = detailLines.join('\n').trim() || null

  return { serviceType, techName, vin, details, vehicles }
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

  // Build vehicles list: combine title vehicle + description vehicles
  let vehicles: ParsedVehicle[] = []
  if (title.isMultiVehicle) {
    // Multi-vehicle event (X2, X3) — all vehicles come from description
    vehicles = desc.vehicles
  } else if (title.vehicleMake) {
    // Single vehicle from title
    vehicles = [{
      year: title.vehicleYear,
      make: title.vehicleMake,
      model: title.vehicleModel,
      vin: desc.vin,
      note: title.jobNote,
    }]
  } else if (desc.vehicles.length > 0) {
    vehicles = desc.vehicles
  }

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
    vehicles,
    isMultiVehicle: title.isMultiVehicle || desc.vehicles.length > 1,
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
  const response = await fetch(`/api/calendar/events?${params}`)
  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.error || `Calendar fetch failed: ${response.status}`)
  }
  const data = await response.json()
  return data.events || []
}

export function getTodayRange(): { timeMin: string; timeMax: string } {
  return getDayRange(new Date())
}

export function getDayRange(date: Date): { timeMin: string; timeMax: string } {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0)
  const end = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59)
  return {
    timeMin: start.toISOString(),
    timeMax: end.toISOString(),
  }
}

export function getWeekRange(): { timeMin: string; timeMax: string } {
  return getWeekRangeForDate(new Date())
}

export function getWeekRangeForDate(date: Date): { timeMin: string; timeMax: string } {
  // Monday-Sunday week containing the given date
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0)
  const dayOfWeek = d.getDay() // 0=Sun, 1=Mon, ...
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
  const monday = new Date(d)
  monday.setDate(d.getDate() + mondayOffset)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  sunday.setHours(23, 59, 59)
  return {
    timeMin: monday.toISOString(),
    timeMax: sunday.toISOString(),
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
