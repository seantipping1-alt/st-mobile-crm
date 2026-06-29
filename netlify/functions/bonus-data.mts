import type { Context } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'

export default async (request: Request, _context: Context) => {
  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { 'Content-Type': 'application/json' },
    })
  }

  const supabaseUrl = Netlify.env.get('SUPABASE_URL')
  const supabaseKey = Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !supabaseKey) {
    return new Response(JSON.stringify({ error: 'Missing env vars' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(supabaseUrl, supabaseKey)

  try {
    // Get the latest snapshot for each month (last 12 months)
    const { data: snapshots, error } = await supabase
      .from('bonus_snapshots')
      .select('*')
      .order('month', { ascending: false })
      .order('snapshot_date', { ascending: false })
      .limit(365)

    if (error) throw error

    // Group by month, take latest snapshot per month
    const byMonth: Record<string, any> = {}
    for (const snap of (snapshots || [])) {
      if (!byMonth[snap.month]) {
        byMonth[snap.month] = snap
      }
    }

    const months = Object.values(byMonth)
      .sort((a: any, b: any) => b.month.localeCompare(a.month))
      .slice(0, 12)

    return new Response(JSON.stringify({ months }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300',
      },
    })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }
}
