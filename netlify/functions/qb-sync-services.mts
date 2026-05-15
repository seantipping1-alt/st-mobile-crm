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
    // Step 1: Fetch all items from QB via the existing qb-api function
    const qbResponse = await fetch(
      `${Netlify.env.get('URL') || 'https://celebrated-cobbler-d9f2a0.netlify.app'}/.netlify/functions/qb-api?path=/query&query=${encodeURIComponent('SELECT * FROM Item MAXRESULTS 200')}`,
      { headers: { 'Accept': 'application/json' } }
    )

    if (!qbResponse.ok) {
      throw new Error(`QB API error: ${await qbResponse.text()}`)
    }

    const qbData = await qbResponse.json()
    const items = qbData?.QueryResponse?.Item || []

    if (items.length === 0) {
      return new Response(JSON.stringify({ error: 'No items found in QuickBooks' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Step 2: Map QB categories to CRM categories
    // Build a lookup of QB Category IDs → category names
    const categoryMap: Record<string, string> = {}
    const QB_TO_CRM_CATEGORY: Record<string, string> = {
      'adas calibrations': 'adas',
      'diagnostics': 'diagnostic',
      'keys': 'keys',
      'fee': 'fee',
      'advertising': 'other',
      'discount': 'other',
    }

    for (const item of items) {
      if (item.Type === 'Category') {
        categoryMap[item.Id] = item.Name
      }
    }

    // Step 3: Build upsert rows — skip Categories and Podcast Advertisement
    const SKIP_NAMES = ['podcast advertisement']
    const rows: any[] = []

    for (const item of items) {
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

    for (const row of rows) {
      const existingId = existingMap[row.qb_item_id]

      if (existingId) {
        // Update existing
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
      } else {
        // Insert new
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
      }
    }

    return new Response(JSON.stringify({
      success: true,
      total_qb_items: items.length,
      synced: rows.length,
      inserted,
      updated,
      skipped: items.length - rows.length,
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
