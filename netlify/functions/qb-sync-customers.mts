import type { Context } from '@netlify/functions'

async function qbQuery(baseUrl: string, query: string): Promise<any[]> {
  const res = await fetch(
    `${baseUrl}/.netlify/functions/qb-api?path=/query&query=${encodeURIComponent(query)}`,
    { headers: { 'Accept': 'application/json' } }
  )
  if (!res.ok) throw new Error(`QB API error: ${await res.text()}`)
  const data = await res.json()
  return data?.QueryResponse?.Customer || []
}

async function qbQueryPaginated(baseUrl: string, baseQuery: string): Promise<any[]> {
  const all: any[] = []
  let startPos = 1
  const pageSize = 500
  while (true) {
    const batch = await qbQuery(baseUrl, `${baseQuery} STARTPOSITION ${startPos} MAXRESULTS ${pageSize}`)
    all.push(...batch)
    if (batch.length < pageSize) break
    startPos += pageSize
  }
  return all
}

function mapCustomer(cust: any): any {
  const givenName = (cust.GivenName || '').trim()
  const familyName = (cust.FamilyName || '').trim()
  const displayName = cust.DisplayName || ''
  const companyName = (cust.CompanyName || '').trim()
  const fullPersonName = [givenName, familyName].filter(Boolean).join(' ')

  const isIndividual = !companyName && givenName && familyName
    && displayName.toLowerCase() === fullPersonName.toLowerCase()

  let primaryContact = null
  if (companyName && fullPersonName && fullPersonName !== companyName) {
    primaryContact = fullPersonName
  }

  const addr = cust.BillAddr || {}

  return {
    name: displayName || companyName || fullPersonName,
    customer_type: isIndividual ? 'individual' : 'shop',
    primary_contact_name: primaryContact,
    phone: cust.PrimaryPhone?.FreeFormNumber || null,
    email: cust.PrimaryEmailAddr?.Address || null,
    address_street: addr.Line1 || null,
    address_city: addr.City || null,
    address_state: addr.CountrySubDivisionCode || null,
    address_zip: addr.PostalCode || null,
    is_active: cust.Active !== false,
    qb_id: String(cust.Id),
    notes: cust.Notes || null,
    updated_at: new Date().toISOString(),
  }
}

export default async (request: Request, _context: Context) => {
  if (request.method !== 'POST') {
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

  try {
    const baseUrl = Netlify.env.get('URL') || 'https://celebrated-cobbler-d9f2a0.netlify.app'
    const allCustomers = await qbQueryPaginated(baseUrl, 'SELECT * FROM Customer')
    const rows = allCustomers.map(mapCustomer)

    if (rows.length === 0) {
      return new Response(JSON.stringify({ message: 'No customers found in QuickBooks' }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      })
    }

    const existingRes = await fetch(
      `${supabaseUrl}/rest/v1/customers?select=id,qb_id&qb_id=not.is.null&limit=5000`,
      { headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}`, 'Accept': 'application/json' } }
    )
    const existing = await existingRes.json()
    const existingMap: Record<string, string> = {}
    for (const e of (Array.isArray(existing) ? existing : [])) {
      if (e.qb_id) existingMap[e.qb_id] = e.id
    }

    const toInsert: any[] = []
    const toUpdate: { id: string; data: any }[] = []
    for (const row of rows) {
      const existingId = existingMap[row.qb_id]
      if (existingId) toUpdate.push({ id: existingId, data: row })
      else toInsert.push(row)
    }

    let inserted = 0, updated = 0

    for (let i = 0; i < toInsert.length; i += 50) {
      const chunk = toInsert.slice(i, i + 50)
      const res = await fetch(`${supabaseUrl}/rest/v1/customers`, {
        method: 'POST',
        headers: {
          'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal,resolution=merge-duplicates',
        },
        body: JSON.stringify(chunk),
      })
      if (res.ok) inserted += chunk.length
    }

    const updateChunks: Promise<void>[] = []
    for (const { id, data } of toUpdate) {
      updateChunks.push(
        fetch(`${supabaseUrl}/rest/v1/customers?id=eq.${id}`, {
          method: 'PATCH',
          headers: {
            'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json', 'Prefer': 'return=minimal',
          },
          body: JSON.stringify(data),
        }).then(res => { if (res.ok) updated++ })
      )
      if (updateChunks.length >= 20) await Promise.all(updateChunks.splice(0))
    }
    if (updateChunks.length > 0) await Promise.all(updateChunks)

    return new Response(JSON.stringify({
      success: true, total_qb_customers: allCustomers.length, synced: rows.length, inserted, updated,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  } catch (error: any) {
    console.error('QB customer sync error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }
}
