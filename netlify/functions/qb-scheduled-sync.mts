import type { Context } from '@netlify/functions'

const QB_API_BASE = 'https://quickbooks.api.intuit.com/v3'

async function getTokens(supabaseUrl: string, supabaseKey: string) {
  const response = await fetch(
    `${supabaseUrl}/rest/v1/qb_tokens?order=updated_at.desc&limit=1`,
    {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Accept': 'application/json',
      },
    }
  )
  if (!response.ok) throw new Error(`Failed to fetch tokens: ${await response.text()}`)
  const tokens = await response.json()
  return tokens.length ? tokens[0] : null
}

async function refreshAccessToken(
  tokenRecord: any,
  supabaseUrl: string,
  supabaseKey: string,
  clientId: string,
  clientSecret: string
) {
  const basicAuth = btoa(`${clientId}:${clientSecret}`)
  const response = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: tokenRecord.refresh_token,
    }),
  })
  if (!response.ok) throw new Error(`Token refresh failed: ${await response.text()}`)

  const tokens = await response.json()
  const now = new Date()
  const expiresAt = new Date(now.getTime() + tokens.expires_in * 1000).toISOString()
  const refreshTokenExpiresAt = tokens.x_refresh_token_expires_in
    ? new Date(now.getTime() + tokens.x_refresh_token_expires_in * 1000).toISOString()
    : null

  await fetch(`${supabaseUrl}/rest/v1/qb_tokens?id=eq.${tokenRecord.id}`, {
    method: 'PATCH',
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: expiresAt,
      refresh_token_expires_at: refreshTokenExpiresAt,
      updated_at: now.toISOString(),
    }),
  })

  return tokens.access_token
}

async function getValidAccessToken(supabaseUrl: string, supabaseKey: string, clientId: string, clientSecret: string) {
  const tokenRecord = await getTokens(supabaseUrl, supabaseKey)
  if (!tokenRecord) throw new Error('QuickBooks not connected')

  let accessToken = tokenRecord.access_token
  const expiresAt = new Date(tokenRecord.expires_at)
  const now = new Date()
  const bufferMs = 5 * 60 * 1000

  if (now.getTime() >= expiresAt.getTime() - bufferMs) {
    accessToken = await refreshAccessToken(tokenRecord, supabaseUrl, supabaseKey, clientId, clientSecret)
  }

  return { accessToken, realmId: tokenRecord.realm_id }
}

async function qbQueryDirect(accessToken: string, realmId: string, query: string, entity: string = 'Item'): Promise<any[]> {
  const url = `${QB_API_BASE}/company/${realmId}/query?query=${encodeURIComponent(query)}`
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json',
    },
  })
  if (!res.ok) throw new Error(`QB query error: ${res.status}`)
  const data = await res.json()
  return data?.QueryResponse?.[entity] || []
}

async function qbQueryPaginated(accessToken: string, realmId: string, baseQuery: string, entity: string): Promise<any[]> {
  const all: any[] = []
  let startPos = 1
  const pageSize = 500
  while (true) {
    const batch = await qbQueryDirect(accessToken, realmId, `${baseQuery} STARTPOSITION ${startPos} MAXRESULTS ${pageSize}`, entity)
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
    qb_balance: cust.Balance || 0,
    updated_at: new Date().toISOString(),
  }
}

const QB_TO_CRM_CATEGORY: Record<string, string> = {
  'adas calibrations': 'adas',
  'diagnostics': 'diagnostic',
  'programming': 'programming',
  'keys': 'keys',
  'fee': 'fee',
  'tpms': 'other',
  'scantool': 'other',
  'merchandise': 'other',
  'teaching': 'other',
  'tech id': 'other',
  'advertising': 'other',
  'discount': 'other',
}

const SKIP_NAMES = new Set(['podcast advertisement'])

function mapItem(item: any): any | null {
  if (item.Type === 'Category') return null
  if (SKIP_NAMES.has(item.Name?.toLowerCase())) return null

  const parentName = item.ParentRef?.name?.toLowerCase() || ''
  let category = QB_TO_CRM_CATEGORY[parentName] || null
  if (!category) {
    category = item.Type === 'Inventory' ? 'inventory' : 'other'
  }

  let qbType = 'service'
  if (item.Type === 'Inventory') qbType = 'inventory'
  else if (item.Type === 'NonInventory') qbType = 'non_inventory'

  return {
    name: item.Name,
    description: (item.Description || '').replace(/Vehicle:[\s\S]*?VIN:[\s\S]*$/i, '').trim() || null,
    category,
    default_rate: item.UnitPrice || 0,
    is_active: item.Active !== false,
    qb_item_id: String(item.Id),
    qb_type: qbType,
    qb_parent_category: item.ParentRef?.name || null,
    updated_at: new Date().toISOString(),
  }
}

// Netlify scheduled function — runs daily at 6 AM Central (11:00 UTC)
export const config = {
  schedule: '0 11 * * *',
}

export default async (_request: Request, _context: Context) => {
  const supabaseUrl = Netlify.env.get('SUPABASE_URL')
  const supabaseKey = Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const clientId = Netlify.env.get('QB_CLIENT_ID')
  const clientSecret = Netlify.env.get('QB_CLIENT_SECRET')

  if (!supabaseUrl || !supabaseKey || !clientId || !clientSecret) {
    console.error('Scheduled sync: missing env vars')
    return new Response('Missing env vars', { status: 500 })
  }

  try {
    const { accessToken, realmId } = await getValidAccessToken(supabaseUrl, supabaseKey, clientId, clientSecret)

    // Fetch all item types directly from QB
    const results = await Promise.allSettled([
      qbQueryDirect(accessToken, realmId, "SELECT * FROM Item WHERE Type = 'Service' MAXRESULTS 500"),
      qbQueryDirect(accessToken, realmId, "SELECT * FROM Item WHERE Type = 'NonInventory' MAXRESULTS 500"),
      qbQueryDirect(accessToken, realmId, "SELECT * FROM Item WHERE Type = 'Inventory' MAXRESULTS 500"),
    ])

    const allItems: any[] = []
    for (const r of results) {
      if (r.status === 'fulfilled') allItems.push(...r.value)
    }

    if (allItems.length === 0) {
      console.log('Scheduled sync: no items found')
      return new Response('No items', { status: 200 })
    }

    const rows = allItems.map(mapItem).filter(Boolean)

    // Bulk upsert using name as conflict column
    let upserted = 0
    const errors: string[] = []

    for (let i = 0; i < rows.length; i += 50) {
      const chunk = rows.slice(i, i + 50)
      const res = await fetch(`${supabaseUrl}/rest/v1/services?on_conflict=name`, {
        method: 'POST',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal,resolution=merge-duplicates',
        },
        body: JSON.stringify(chunk),
      })
      if (res.ok) {
        upserted += chunk.length
      } else {
        const errText = await res.text().catch(() => 'unknown')
        errors.push(`Batch ${Math.floor(i / 50)}: ${errText}`)
      }
    }

    console.log(`Scheduled sync services: ${upserted} upserted out of ${allItems.length} QB items${errors.length ? `, ${errors.length} errors` : ''}`)

    // --- Customer balance sync ---
    let custUpserted = 0
    const custErrors: string[] = []
    try {
      const allCustomers = await qbQueryPaginated(accessToken, realmId, 'SELECT * FROM Customer', 'Customer')
      const custRows = allCustomers.map(mapCustomer)

      for (let i = 0; i < custRows.length; i += 50) {
        const chunk = custRows.slice(i, i + 50)
        const res = await fetch(`${supabaseUrl}/rest/v1/customers?on_conflict=qb_id`, {
          method: 'POST',
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal,resolution=merge-duplicates',
          },
          body: JSON.stringify(chunk),
        })
        if (res.ok) {
          custUpserted += chunk.length
        } else {
          const errText = await res.text().catch(() => 'unknown')
          custErrors.push(`Customer batch ${Math.floor(i / 50)}: ${errText}`)
        }
      }
      console.log(`Scheduled sync customers: ${custUpserted} upserted out of ${allCustomers.length} QB customers${custErrors.length ? `, ${custErrors.length} errors` : ''}`)
    } catch (custErr: any) {
      console.error('Customer sync error (non-fatal):', custErr.message)
    }

    // --- Bonus P&L snapshot ---
    try {
      const now = new Date()
      const year = now.getUTCFullYear()
      const month = now.getUTCMonth() // 0-indexed
      const startDate = `${year}-${String(month + 1).padStart(2, '0')}-01`
      const lastDay = new Date(year, month + 1, 0).getDate()
      const endDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
      const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`
      const today = now.toISOString().split('T')[0]

      // Days elapsed (1-indexed, today counts)
      const dayOfMonth = now.getUTCDate()

      const plUrl = `${QB_API_BASE}/company/${realmId}/reports/ProfitAndLoss?start_date=${startDate}&end_date=${endDate}&accounting_method=Accrual&minorversion=65`
      const plRes = await fetch(plUrl, {
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' },
      })
      if (!plRes.ok) throw new Error(`P&L report error: ${plRes.status}`)
      const plData = await plRes.json()

      let revenue = 0, expenses = 0
      const rows2 = plData?.Rows?.Row || []
      for (const row of rows2) {
        if (row.group === 'Income' && row.Summary) {
          revenue = parseFloat(row.Summary.ColData?.[1]?.value || '0')
        } else if (row.group === 'Expenses' && row.Summary) {
          expenses = parseFloat(row.Summary.ColData?.[1]?.value || '0')
        }
      }
      const profit = revenue - expenses

      // Calculate bonus rate using the sliding scale
      const FLOOR = 14000, TOP = 20000, MIN_RATE = 0.02, MAX_RATE = 0.04
      let bonusRate = 0
      if (profit >= TOP) {
        bonusRate = MAX_RATE
      } else if (profit >= FLOOR) {
        bonusRate = MIN_RATE + (MAX_RATE - MIN_RATE) * ((profit - FLOOR) / (TOP - FLOOR))
      }

      const snapshot = {
        month: monthKey,
        snapshot_date: today,
        revenue,
        expenses,
        profit,
        bonus_rate: Math.round(bonusRate * 10000) / 10000,
        days_elapsed: dayOfMonth,
        days_in_month: lastDay,
      }

      const snapshotRes = await fetch(`${supabaseUrl}/rest/v1/bonus_snapshots?on_conflict=month,snapshot_date`, {
        method: 'POST',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal,resolution=merge-duplicates',
        },
        body: JSON.stringify(snapshot),
      })
      if (snapshotRes.ok) {
        console.log(`Bonus snapshot saved: ${monthKey} profit=$${profit.toFixed(2)} rate=${(bonusRate * 100).toFixed(1)}%`)
      } else {
        console.error('Bonus snapshot upsert failed:', await snapshotRes.text().catch(() => 'unknown'))
      }
    } catch (plErr: any) {
      console.error('P&L snapshot error (non-fatal):', plErr.message)
    }

    return new Response('OK', { status: 200 })

  } catch (error: any) {
    console.error('Scheduled sync error:', error.message)
    return new Response(error.message, { status: 500 })
  }
}
