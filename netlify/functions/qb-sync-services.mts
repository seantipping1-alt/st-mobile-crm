import type { Context } from '@netlify/functions'

async function qbQuery(baseUrl: string, query: string): Promise<any[]> {
  const res = await fetch(
    `${baseUrl}/.netlify/functions/qb-api?path=/query&query=${encodeURIComponent(query)}`,
    { headers: { 'Accept': 'application/json' } }
  )
  if (!res.ok) throw new Error(`QB API error: ${await res.text()}`)
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
  if (!supabaseUrl || !supabaseKey) {
    return new Response(JSON.stringify({ error: 'Missing env vars' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    const baseUrl = Netlify.env.get('URL') || 'https://celebrated-cobbler-d9f2a0.netlify.app'

    // Fetch services, non-inventory, and inventory in parallel
    const results = await Promise.allSettled([
      qbQuery(baseUrl, "SELECT * FROM Item WHERE Type = 'Service' MAXRESULTS 500"),
      qbQuery(baseUrl, "SELECT * FROM Item WHERE Type = 'NonInventory' MAXRESULTS 500"),
      qbQuery(baseUrl, "SELECT * FROM Item WHERE Type = 'Inventory' MAXRESULTS 500"),
    ])

    const allItems: any[] = []
    const fetchErrors: string[] = []
    for (const [i, r] of results.entries()) {
      if (r.status === 'fulfilled') {
        allItems.push(...r.value)
      } else {
        const types = ['Service', 'NonInventory', 'Inventory']
        fetchErrors.push(`${types[i]}: ${r.reason?.message || 'unknown'}`)
      }
    }

    if (allItems.length === 0) {
      return new Response(JSON.stringify({ error: fetchErrors.length > 0 ? fetchErrors.join('; ') : 'No items to sync' }), {
        status: 404, headers: { 'Content-Type': 'application/json' },
      })
    }

    const rows = allItems.map(mapItem).filter(Boolean)

    // Get existing QB-linked services
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

    // Split into inserts and updates
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

    // Batch insert (Supabase accepts arrays)
    if (toInsert.length > 0) {
      // Insert in chunks of 50
      for (let i = 0; i < toInsert.length; i += 50) {
        const chunk = toInsert.slice(i, i + 50)
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
      }
    }

    // Batch updates via individual PATCH
    const updateChunks: Promise<void>[] = []
    const errors: string[] = []
    for (const { id, data } of toUpdate) {
      updateChunks.push(
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
          if (res.ok) {
            updated++
          } else {
            const errText = await res.text().catch(() => 'unknown')
            errors.push(`${data.name}: ${errText}`)
          }
        })
      )
      // Fire in batches of 20
      if (updateChunks.length >= 20) {
        await Promise.all(updateChunks.splice(0))
      }
    }
    if (updateChunks.length > 0) await Promise.all(updateChunks)

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
