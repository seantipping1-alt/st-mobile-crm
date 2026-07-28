import type { Context } from '@netlify/functions'

const QB_API_BASE = 'https://quickbooks.api.intuit.com/v3'

// Service line classification from QB item name
// QB items look like "Programming:GM Engine Control Module..." or "Diagnostics:Full System Scan"
function classifyServiceLine(itemName: string): string {
  const lower = (itemName || '').toLowerCase()
  if (lower.startsWith('programming:') || lower.startsWith('programming')) return 'programming'
  if (lower.startsWith('diagnostics:') || lower.startsWith('diagnostics') || lower.startsWith('diagnostic')) return 'diagnostics'
  if (lower.startsWith('adas')) return 'adas'
  if (lower.startsWith('keys:') || lower.startsWith('keys') || lower.startsWith('key ')) return 'keys'
  if (lower.startsWith('scantool') || lower.startsWith('scan tool')) return 'scantool'
  if (lower.startsWith('teaching') || lower.startsWith('training')) return 'teaching'
  if (lower.startsWith('fee')) return 'fee'
  if (lower.startsWith('tpms')) return 'other'
  return 'other'
}

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

    // Determine sync window — pull from start of year by default, or incremental from last sync
    const body = request.method === 'POST' ? await request.json().catch(() => ({})) : {}
    const sinceDate = body.since || '2026-01-01'
    const untilDate = body.until || ''

    console.log(`Invoice sync starting from ${sinceDate}${untilDate ? ` to ${untilDate}` : ''}...`)

    // 1. Pull all invoices since date
    let invoiceQuery = `SELECT * FROM Invoice WHERE TxnDate >= '${sinceDate}'`
    if (untilDate) invoiceQuery += ` AND TxnDate <= '${untilDate}'`
    invoiceQuery += ' ORDER BY TxnDate ASC'
    const allInvoices = await qbQueryPaginated(accessToken, realmId, invoiceQuery, 'Invoice')
    console.log(`Fetched ${allInvoices.length} invoices from QB`)

    // 2. Pull payments to determine paid dates
    let paymentQuery = `SELECT * FROM Payment WHERE TxnDate >= '${sinceDate}'`
    if (untilDate) paymentQuery += ` AND TxnDate <= '${untilDate}'`
    paymentQuery += ' ORDER BY TxnDate ASC'
    const allPayments = await qbQueryPaginated(accessToken, realmId, paymentQuery, 'Payment')
    console.log(`Fetched ${allPayments.length} payments from QB`)

    // Build payment map: qb_invoice_id -> earliest payment date
    const paymentMap: Record<string, string> = {}
    for (const pmt of allPayments) {
      for (const line of (pmt.Line || [])) {
        for (const linked of (line.LinkedTxn || [])) {
          if (linked.TxnType === 'Invoice') {
            const invId = linked.TxnId
            const pmtDate = pmt.TxnDate
            if (!paymentMap[invId] || pmtDate < paymentMap[invId]) {
              paymentMap[invId] = pmtDate
            }
          }
        }
      }
    }

    // 3. Process invoices in batches
    let invoiceCount = 0
    let lineCount = 0
    const errors: string[] = []

    // Build all invoice rows
    const invoiceRows: any[] = []
    const invoiceLineMap: Record<string, any[]> = {} // qb_invoice_id -> line rows

    for (const inv of allInvoices) {
      const qbInvoiceId = inv.Id
      const techField = (inv.CustomField || []).find((cf: any) => cf.Name === 'Technician' || cf.DefinitionId === '1')
      const techName = techField?.StringValue || null

      invoiceRows.push({
        qb_invoice_id: qbInvoiceId,
        doc_number: inv.DocNumber || null,
        customer_qb_id: inv.CustomerRef?.value || null,
        customer_name: inv.CustomerRef?.name || null,
        tech_name: techName,
        invoice_date: inv.TxnDate,
        total: inv.TotalAmt || 0,
        balance: inv.Balance || 0,
        paid_date: (inv.Balance === 0 && paymentMap[qbInvoiceId]) ? paymentMap[qbInvoiceId] : null,
        updated_at: new Date().toISOString(),
      })

      // Collect line items
      const lines: any[] = []
      for (const line of (inv.Line || [])) {
        if (line.DetailType !== 'SalesItemLineDetail') continue
        const detail = line.SalesItemLineDetail || {}
        const itemName = detail.ItemRef?.name || ''
        lines.push({
          qb_item_id: detail.ItemRef?.value || null,
          qb_item_name: itemName,
          service_line: classifyServiceLine(itemName),
          description: (line.Description || '').substring(0, 500),
          amount: line.Amount || 0,
          quantity: detail.Qty || 1,
          unit_price: detail.UnitPrice || 0,
        })
      }
      if (lines.length > 0) invoiceLineMap[qbInvoiceId] = lines
    }

    // Batch upsert invoices (50 at a time)
    for (let i = 0; i < invoiceRows.length; i += 50) {
      const chunk = invoiceRows.slice(i, i + 50)
      const res = await fetch(`${supabaseUrl}/rest/v1/fin_invoices?on_conflict=qb_invoice_id`, {
        method: 'POST',
        headers: {
          'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json', 'Prefer': 'return=representation,resolution=merge-duplicates',
        },
        body: JSON.stringify(chunk),
      })
      if (res.ok) {
        const upserted = await res.json()
        invoiceCount += upserted.length

        // Now handle line items for each upserted invoice
        for (const uInv of upserted) {
          const qbId = uInv.qb_invoice_id
          const finId = uInv.id
          const lines = invoiceLineMap[qbId]
          if (!lines || lines.length === 0) continue

          // Delete old lines
          await fetch(`${supabaseUrl}/rest/v1/fin_invoice_lines?fin_invoice_id=eq.${finId}`, {
            method: 'DELETE',
            headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}`, 'Prefer': 'return=minimal' },
          })

          // Insert new lines
          const lineRows = lines.map((l: any) => ({ ...l, fin_invoice_id: finId }))
          const linesRes = await fetch(`${supabaseUrl}/rest/v1/fin_invoice_lines`, {
            method: 'POST',
            headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
            body: JSON.stringify(lineRows),
          })
          if (linesRes.ok) lineCount += lineRows.length
        }
      } else {
        errors.push(`Invoice batch ${Math.floor(i / 50)}: ${await res.text().catch(() => 'unknown')}`)
      }
    }

    // 4. Upsert payments
    let paymentCount = 0
    for (const pmt of allPayments) {
      for (const line of (pmt.Line || [])) {
        for (const linked of (line.LinkedTxn || [])) {
          if (linked.TxnType === 'Invoice') {
            const pmtRow = {
              qb_payment_id: `${pmt.Id}-${linked.TxnId}`,
              customer_qb_id: pmt.CustomerRef?.value || null,
              payment_date: pmt.TxnDate,
              amount: line.Amount || 0,
              qb_invoice_id: linked.TxnId,
            }
            const pmtRes = await fetch(`${supabaseUrl}/rest/v1/fin_payments?on_conflict=qb_payment_id`, {
              method: 'POST',
              headers: {
                'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}`,
                'Content-Type': 'application/json', 'Prefer': 'return=minimal,resolution=merge-duplicates',
              },
              body: JSON.stringify(pmtRow),
            })
            if (pmtRes.ok) paymentCount++
          }
        }
      }
    }

    console.log(`Invoice sync complete: ${invoiceCount} invoices, ${lineCount} line items, ${paymentCount} payments`)

    return new Response(JSON.stringify({
      success: true,
      invoices: invoiceCount,
      line_items: lineCount,
      payments: paymentCount,
      errors: errors.length > 0 ? errors : undefined,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })

  } catch (error: any) {
    console.error('Invoice sync error:', error)
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}
