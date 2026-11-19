import type { Context } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'
import { timingSafeEqual } from 'node:crypto'

// Read-only customer list for the ST Intake Apps Script (CRM_Sync.gs).
// Replaces the intake's direct read of the customers table.
// Auth: `Authorization: Bearer <INTAKE_SYNC_KEY>` (the header CRM_Sync.gs already sends).
// Returns only the fields the shop sync needs, active customers only.
// Fails closed: no env secret -> 503, wrong/missing key -> 401.

const FIELDS =
  'name, phone, email, address_street, address_city, address_state, address_zip, customer_type, is_active, qb_balance'

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })

function keyMatches(given: string, expected: string): boolean {
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

export default async (request: Request, _context: Context) => {
  if (request.method !== 'GET') return json(405, { error: 'Method not allowed' })

  const expected = Netlify.env.get('INTAKE_SYNC_KEY') || ''
  const supabaseUrl = Netlify.env.get('SUPABASE_URL')
  const supabaseKey = Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (expected.length < 32 || !supabaseUrl || !supabaseKey) {
    return json(503, { error: 'Not configured' })
  }

  const auth = request.headers.get('authorization') || ''
  const given = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  if (!given || !keyMatches(given, expected)) {
    return json(401, { error: 'Unauthorized' })
  }

  const supabase = createClient(supabaseUrl, supabaseKey)
  const { data, error } = await supabase
    .from('customers')
    .select(FIELDS)
    .eq('is_active', true)
    .order('name')
    .limit(5000)

  if (error) {
    console.error('intake-customers query error:', error.message)
    return json(500, { error: 'Query failed' })
  }
  return json(200, data ?? [])
}
