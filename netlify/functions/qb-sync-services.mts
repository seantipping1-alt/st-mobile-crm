import type { Context } from '@netlify/functions'

export default async (request: Request, _context: Context) => {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const supabaseUrl = Netlify.env.get('SUPABASE_URL')
  const supabaseKey = Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !supabaseKey) {
    return new Response(JSON.stringify({ error: 'Missing Supabase environment variables' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    const baseUrl = Netlify.env.get('URL') || 'https://celebrated-cobbler-d9f2a0.netlify.app'

    // Step 1: Fetch ALL items from QB with pagination (1000 max per page)
    let allItems: any[] = []
    let startPosition = 1
    const pageSize = 1000

    while (true) {
      const query = `SELECT * FROM Item STARTPOSITION ${startPosition} MAXRESULTS ${pageSize}`
      const qbResponse = await fetch(
        `${baseUrl}/.netlify/functions/qb-api?path=/query&query=${encodeURIComponent(query)}`,
        { headers: { 'Accept': 'application/json' } }
      )

      if (!qbResponse.ok) {
        throw new Error(`QB API error: ${await qbResponse.text()}`)
      }

      const qbData = await qbResponse.json()
      const items = qbData?.QueryResponse?.Item || []
      allItems = allItems.concat(items)

      // If we got fewer than pageSize, we've reached the end
      if (items.length < pageSize) break
      startPosition += pageSize
    }

    if (allItems.length === 0) {
      return new Response(JSON.stringify({ error: 'No items found in QuickBooks' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Step 2: Map QB categories to CRM categories
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

    // Step 3: Build upsert rows — skip Categories and Podcast Advertisement
    const SKIP_NAMES = ['podcast advertisement']
    const rows: any[] = []

    for (const item of allItems) {
      if (item.Type === 'Category') continue
      if (SKIP_NAMES.includes(item.Name?.toLowerCase())) continue

      // Determine CRM category from QB parent or type
      const parentName = item.ParentRef?.name?.toLowerCase() || ''
      let crmCategory = QB_TO_CRM_CATEGORY[parentName] || null

      // Inventory items without a mapped parent → 'inventory' category
      if (!crmCategory) {
        if (item.Type === 'Inventory') crmCategory = 'inventory'
        else crmCategory = 'other'
      }

      // Determine qb_type
      let qbType = 'service'
      if (item.Type === 'Inventory') qbType = 'inventory'
      else if (item.Type === 'NonInventory') qbType = 'non_inventory'

      rows.push({
        name: item.Name,
        description: (item.Description || '').replace(/Vehicle:[\s\S]*?VIN:[\s\S]*$/i, '').trim() || null,
        category: crmCategory,
        default_rate: item.UnitPrice || 0,
        is_active: item.Active !== false,
        qb_item_id: String(item.Id),
        qb_type: qbType,
        qb_parent_category: item.ParentRef?.name || null,
        updated_at: new Date().toISOString(),
      })
    }

    // Step 4: Upsert into Supabase services table
    // First, get existing services with qb_item_ids to determine insert vs update
    const existingRes = await fetch(
      `${supabaseUrl}/rest/v1/services?select=id,qb_item_id&qb_item_id=not.is.null`,
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
    for (const e of existing) {
      if (e.qb_item_id) existingMap[e.qb_item_id] = e.id
    }

    let inserted = 0
    let updated = 0
    let errors = 0

    for (const row of rows) {
      const existingId = existingMap[row.qb_item_id]

      try {
        if (existingId) {
          const res = await fetch(
            `${supabaseUrl}/rest/v1/services?id=eq.${existingId}`,
            {
              method: 'PATCH',
              headers: {
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal',
              },
              body: JSON.stringify(row),
            }
          )
          if (res.ok) updated++
          else errors++
        } else {
          const res = await fetch(
            `${supabaseUrl}/rest/v1/services`,
            {
              method: 'POST',
              headers: {
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal',
              },
              body: JSON.stringify(row),
            }
          )
          if (res.ok) inserted++
          else errors++
        }
      } catch {
        errors++
      }
    }

    return new Response(JSON.stringify({
      success: true,
      total_qb_items: allItems.length,
      synced: rows.length,
      inserted,
      updated,
      errors,
      skipped: allItems.length - rows.length,
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
