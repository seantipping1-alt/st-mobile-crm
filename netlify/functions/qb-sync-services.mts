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

async function qbQueryDirect(accessToken: string, realmId: string, query: string): Promise<any[]> {
  const url = `${QB_API_BASE}/company/${realmId}/query?query=${encodeURIComponent(query)}`
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json',
    },
  })
  if (!res.ok) throw new Error(`QB query error: ${res.status} ${await res.text()}`)
  const data = await res.json()
  return data?.QueryResponse?.Item || []
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

export default async (request: Request, _context: Context) => {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { 'Content-Type': 'application/json' },
    })
  }

  const supabaseUrl = Netlify.env.get('SUPABASE_URL')
  const supabaseKey = Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const clientId = Netlify.env.get('QB_CLIENT_ID')
  const clientSecret = Netlify.env.get('QB_CLIENT_SECRET')

  if (!supabaseUrl || !supabaseKey || !clientId || !clientSecret) {
    return new Response(JSON.stringify({ error: 'Missing env vars' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    // Step 1: Get QB access token
    let accessToken: string
    let realmId: string
    try {
      const result = await getValidAccessToken(supabaseUrl, supabaseKey, clientId, clientSecret)
      accessToken = result.accessToken
      realmId = result.realmId
    } catch (err: any) {
      return new Response(JSON.stringify({ error: `Token error: ${err.message}` }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      })
    }

    // Step 2: Fetch items from QB (sequentially to avoid overwhelming)
    const allItems: any[] = []
    const fetchErrors: string[] = []

    for (const type of ['Service', 'NonInventory', 'Inventory']) {
      try {
        const items = await qbQueryDirect(accessToken, realmId, `SELECT * FROM Item WHERE Type = '${type}' MAXRESULTS 500`)
        allItems.push(...items)
      } catch (err: any) {
        fetchErrors.push(`${type}: ${err.message}`)
      }
    }

    if (allItems.length === 0) {
      return new Response(JSON.stringify({ error: fetchErrors.length > 0 ? fetchErrors.join('; ') : 'No items to sync' }), {
        status: 404, headers: { 'Content-Type': 'application/json' },
      })
    }

    const rows = allItems.map(mapItem).filter(Boolean)

    // Step 3: Get existing QB-linked services from Supabase
    const existingRes = await fetch(
      `${supabaseUrl}/rest/v1/services?select=id,qb_item_id&qb_item_id=not.is.null&limit=1000`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Accept': 'application/json',
        },
      }
    )
    const existing = await existingRes.json()
    const existingMap: Record<string, string> = {}
    for (const e of (Array.isArray(existing) ? existing : [])) {
      if (e.qb_item_id) existingMap[e.qb_item_id] = e.id
    }

    // Step 4: Split into inserts and updates
    const toInsert: any[] = []
    const toUpdate: { id: string; data: any }[] = []

    for (const row of rows) {
      const existingId = existingMap[row.qb_item_id]
      if (existingId) {
        toUpdate.push({ id: existingId, data: row })
      } else {
        toInsert.push(row)
      }
    }

    let inserted = 0
    let updated = 0
    const errors: string[] = []

    // Step 5: Insert new items in chunks
    if (toInsert.length > 0) {
      for (let i = 0; i < toInsert.length; i += 50) {
        const chunk = toInsert.slice(i, i + 50)
        try {
          const res = await fetch(`${supabaseUrl}/rest/v1/services`, {
            method: 'POST',
            headers: {
              'apikey': supabaseKey,
              'Authorization': `Bearer ${supabaseKey}`,
              'Content-Type': 'application/json',
              'Prefer': 'return=minimal,resolution=ignore-duplicates',
            },
            body: JSON.stringify(chunk),
          })
          if (res.ok) inserted += chunk.length
          else errors.push(`Insert batch ${i}: ${await res.text()}`)
        } catch (err: any) {
          errors.push(`Insert batch ${i}: ${err.message}`)
        }
      }
    }

    // Step 6: Update existing items (sequentially in small batches)
    for (let i = 0; i < toUpdate.length; i += 10) {
      const batch = toUpdate.slice(i, i + 10)
      const results = await Promise.allSettled(
        batch.map(({ id, data }) =>
          fetch(`${supabaseUrl}/rest/v1/services?id=eq.${id}`, {
            method: 'PATCH',
            headers: {
              'apikey': supabaseKey,
              'Authorization': `Bearer ${supabaseKey}`,
              'Content-Type': 'application/json',
              'Prefer': 'return=minimal',
            },
            body: JSON.stringify(data),
          }).then(async res => {
            if (res.ok) return true
            throw new Error(`${data.name}: ${await res.text()}`)
          })
        )
      )
      for (const r of results) {
        if (r.status === 'fulfilled') updated++
        else errors.push(r.reason?.message || 'unknown update error')
      }
    }

    return new Response(JSON.stringify({
      success: true,
      total_qb_items: allItems.length,
      synced: rows.length,
      inserted,
      updated,
      errors: errors.length > 0 ? errors : undefined,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error: any) {
    console.error('QB sync error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
