import type { Context } from '@netlify/functions'

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_CALENDAR_API = 'https://www.googleapis.com/calendar/v3'

async function getAccessToken(clientId: string, clientSecret: string, refreshToken: string): Promise<string> {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Token refresh failed: ${err}`)
  }

  const data = await response.json()
  return data.access_token
}

export default async (request: Request, _context: Context) => {
  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const clientId = Netlify.env.get('GOOGLE_CLIENT_ID')
  const clientSecret = Netlify.env.get('GOOGLE_CLIENT_SECRET')
  const refreshToken = Netlify.env.get('GOOGLE_REFRESH_TOKEN')
  const calendarId = Netlify.env.get('GOOGLE_CALENDAR_ID')

  if (!clientId || !clientSecret || !refreshToken || !calendarId) {
    return new Response(JSON.stringify({ error: 'Missing Google Calendar environment variables' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    const accessToken = await getAccessToken(clientId, clientSecret, refreshToken)

    const url = new URL(request.url)
    const timeMin = url.searchParams.get('timeMin')
    const timeMax = url.searchParams.get('timeMax')

    // Build Calendar API request
    const calUrl = new URL(`${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events`)
    calUrl.searchParams.set('singleEvents', 'true')
    calUrl.searchParams.set('orderBy', 'startTime')
    calUrl.searchParams.set('maxResults', '50')
    if (timeMin) calUrl.searchParams.set('timeMin', timeMin)
    if (timeMax) calUrl.searchParams.set('timeMax', timeMax)

    const calResponse = await fetch(calUrl.toString(), {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
    })

    if (!calResponse.ok) {
      const err = await calResponse.text()
      throw new Error(`Calendar API error: ${err}`)
    }

    const calData = await calResponse.json()

    // Return simplified event list
    const events = (calData.items || []).map((event: any) => ({
      id: event.id,
      summary: event.summary || '',
      description: event.description || '',
      location: event.location || '',
      start: event.start?.dateTime || event.start?.date || '',
      end: event.end?.dateTime || event.end?.date || '',
      colorId: event.colorId || null,
      htmlLink: event.htmlLink || '',
    }))

    return new Response(JSON.stringify({ events }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      },
    })
  } catch (error: any) {
    console.error('GCal API error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
