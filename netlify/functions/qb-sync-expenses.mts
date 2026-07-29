import type { Context } from '@netlify/functions'

const QB_API_BASE = 'https://quickbooks.api.intuit.com/v3'

async function getTokens(supabaseUrl: string, supabaseKey: string) {
  const res = await fetch(`${supabaseUrl}/rest/v1/qb_tokens?order=updated_at.desc&limit=1`, {
    headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}`, 'Accept': 'application/json' }
  })
  if (!res.ok) throw new Error(`Failed to fetch tokens: ${await res.text()}`)
  const tokens = await res.json()
  return tokens.length ? tokens[0] : null
}

async function refreshAccessToken(record: any, supabaseUrl: string, supabaseKey: string, clientId: string, clientSecret: string) {
  const basicAuth = btoa(`${clientId}:${clientSecret}`)
  const res = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
    method: 'POST',
    headers: { 'Authorization': `Basic ${basicAuth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: record.refresh_token })
  })
  if (!res.ok) throw new Error(`Token refresh failed: ${await res.text()}`)
  const tokens = await res.json()
  await fetch(`${supabaseUrl}/rest/v1/qb_tokens?id=eq.${record.id}`, {
    method: 'PATCH',
    headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
    body: JSON.stringify({ access_token: tokens.access_token, refresh_token: tokens.refresh_token, expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(), updated_at: new Date().toISOString() })
  })
  return tokens.access_token
}

async function getValidAccessToken(supabaseUrl: string, supabaseKey: string, clientId: string, clientSecret: string) {
  const record = await getTokens(supabaseUrl, supabaseKey)
  if (!record) throw new Error('QuickBooks not connected')
  if (Date.now() >= new Date(record.expires_at).getTime() - 5 * 60000) {
    return { accessToken: await refreshAccessToken(record, supabaseUrl, supabaseKey, clientId, clientSecret), realmId: record.realm_id }
  }
  return { accessToken: record.access_token, realmId: record.realm_id }
}

async function qbQueryPaginated(token: string, realmId: string, baseQuery: string, entityType: string): Promise<any[]> {
  const all: any[] = []
  let start = 1
  while (true) {
    const query = `${baseQuery} STARTPOSITION ${start} MAXRESULTS 100`
    const url = `${QB_API_BASE}/company/${realmId}/query?query=${encodeURIComponent(query)}`
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' } })
    if (!res.ok) throw new Error(`QB query error: ${res.status}`)
    const data = await res.json()
    const items = data?.QueryResponse?.[entityType] || []
    all.push(...items)
    if (items.length < 100) break
    start += 100
  }
  return all
}

export default async (request: Request, _context: Context) => {
  const supabaseUrl = Netlify.env.get('SUPABASE_URL')
  const supabaseKey = Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const clientId = Netlify.env.get('QB_CLIENT_ID')
  const clientSecret = Netlify.env.get('QB_CLIENT_SECRET')

  if (!supabaseUrl || !supabaseKey || !clientId || !clientSecret) {
    return new Response(JSON.stringify({ error: 'Missing env vars' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }

  try {
    const { accessToken, realmId } = await getValidAccessToken(supabaseUrl, supabaseKey, clientId, clientSecret)

    const body = request.method === 'POST' ? await request.json().catch(() => ({})) : {}
    const sinceDate = body.since || '2026-01-01'
    const untilDate = body.until || ''

    console.log(`Expense sync starting from ${sinceDate}${untilDate ? ` to ${untilDate}` : ''}...`)

    // Load vendor map from Supabase
    const vmRes = await fetch(`${supabaseUrl}/rest/v1/fin_vendor_map?select=vendor,treatment,service_line&limit=500`, {
      headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}`, 'Accept': 'application/json' }
    })
    const vendorMap: Record<string, { treatment: string; service_line: string | null }> = {}
    if (vmRes.ok) {
      const rows = await vmRes.json()
      for (const row of rows) {
        vendorMap[row.vendor.toLowerCase()] = { treatment: row.treatment, service_line: row.service_line }
      }
    }
    console.log(`Loaded ${Object.keys(vendorMap).length} vendor mappings`)

    // Pull Purchase transactions from QB
    let purchaseQuery = `SELECT * FROM Purchase WHERE TxnDate >= '${sinceDate}'`
    if (untilDate) purchaseQuery += ` AND TxnDate <= '${untilDate}'`
    purchaseQuery += ' ORDER BY TxnDate ASC'
    const purchases = await qbQueryPaginated(accessToken, realmId, purchaseQuery, 'Purchase')
    console.log(`Fetched ${purchases.length} purchases from QB`)

    // Also pull Bill transactions (some vendors invoice as bills)
    let billQuery = `SELECT * FROM Bill WHERE TxnDate >= '${sinceDate}'`
    if (untilDate) billQuery += ` AND TxnDate <= '${untilDate}'`
    billQuery += ' ORDER BY TxnDate ASC'
    const bills = await qbQueryPaginated(accessToken, realmId, billQuery, 'Bill')
    console.log(`Fetched ${bills.length} bills from QB`)

    // Process all transactions
    const expenseRows: any[] = []
    const allTxns = [
      ...purchases.map(p => ({ ...p, _type: 'Purchase' })),
      ...bills.map(b => ({ ...b, _type: 'Bill' }))
    ]

    let classified = 0
    let unclassified = 0

    for (const txn of allTxns) {
      const qbId = `${txn._type}-${txn.Id}`
      const vendorName = txn.EntityRef?.name || ''
      const amount = txn.TotalAmt || 0
      const txnDate = txn.TxnDate

      if (!txnDate || amount <= 0) continue

      // Check if this is a wage/payroll transaction
      const isWages = (txn.Line || []).some((line: any) => {
        const accountName = (line.AccountBasedExpenseLineDetail?.AccountRef?.name || '').toLowerCase()
        return accountName.includes('wage') || accountName.includes('salary') || accountName.includes('payroll')
      })

      let treatment = 'unknown'
      let serviceLine: string | null = null
      let note: string | null = null

      if (isWages) {
        treatment = 'wages'
        note = vendorName || 'Payroll'
      } else {
        // Look up vendor in map
        const vendorLower = vendorName.toLowerCase()
        const mapping = vendorMap[vendorLower]

        if (mapping) {
          treatment = mapping.treatment
          serviceLine = mapping.service_line
          classified++
        } else {
          // Try partial match
          const partialMatch = Object.entries(vendorMap).find(([key]) =>
            vendorLower.includes(key) || key.includes(vendorLower)
          )
          if (partialMatch) {
            treatment = partialMatch[1].treatment
            serviceLine = partialMatch[1].service_line
            classified++
          } else {
            unclassified++
            note = `Unclassified vendor: ${vendorName}`
          }
        }
      }

      expenseRows.push({
        qb_purchase_id: qbId,
        vendor_name: vendorName || null,
        amount,
        txn_date: txnDate,
        treatment,
        service_line: serviceLine,
        note,
        updated_at: new Date().toISOString(),
      })
    }

    // Batch upsert expenses (50 at a time)
    let upserted = 0
    const errors: string[] = []

    for (let i = 0; i < expenseRows.length; i += 50) {
      const chunk = expenseRows.slice(i, i + 50)
      const res = await fetch(`${supabaseUrl}/rest/v1/fin_expenses?on_conflict=qb_purchase_id`, {
        method: 'POST',
        headers: {
          'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json', 'Prefer': 'return=minimal,resolution=merge-duplicates',
        },
        body: JSON.stringify(chunk),
      })
      if (res.ok) upserted += chunk.length
      else errors.push(`Batch ${Math.floor(i / 50)}: ${await res.text().catch(() => 'unknown')}`)
    }

    const result = {
      success: true,
      purchases: purchases.length,
      bills: bills.length,
      total_transactions: allTxns.length,
      classified,
      unclassified,
      upserted,
      errors: errors.length > 0 ? errors : undefined,
    }

    console.log(`Expense sync complete: ${upserted} upserted, ${classified} classified, ${unclassified} unclassified`)

    return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } })

  } catch (error: any) {
    console.error('Expense sync error:', error)
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}
