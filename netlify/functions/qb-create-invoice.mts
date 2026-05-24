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

export default async (request: Request, _context: Context) => {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const clientId = Netlify.env.get('QB_CLIENT_ID')
  const clientSecret = Netlify.env.get('QB_CLIENT_SECRET')
  const supabaseUrl = Netlify.env.get('SUPABASE_URL')
  const supabaseKey = Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!clientId || !clientSecret || !supabaseUrl || !supabaseKey) {
    return new Response(JSON.stringify({ error: 'Missing required environment variables' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    const { job_id } = await request.json()
    if (!job_id) {
      return new Response(JSON.stringify({ error: 'Missing job_id' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // 1. Load the job + customer
    const jobRes = await fetch(
      `${supabaseUrl}/rest/v1/jobs?id=eq.${job_id}&select=*,customers(id,name,qb_id)`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Accept': 'application/json',
        },
      }
    )
    const jobs = await jobRes.json()
    if (!jobs.length) {
      return new Response(JSON.stringify({ error: 'Job not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    const job = jobs[0]

    if (job.qb_invoice_id) {
      return new Response(JSON.stringify({ error: 'Invoice already created', invoice_number: job.invoice_number }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const customer = job.customers
    if (!customer?.qb_id) {
      return new Response(JSON.stringify({ error: 'Customer has no QuickBooks link. Sync customers first.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // 2. Load line items
    const liRes = await fetch(
      `${supabaseUrl}/rest/v1/job_line_items?job_id=eq.${job_id}&order=sort_order`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Accept': 'application/json',
        },
      }
    )
    const lineItems = await liRes.json()

    if (!lineItems.length) {
      return new Response(JSON.stringify({ error: 'No line items on this job' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // 3. Load vehicles for description lines
    const jvRes = await fetch(
      `${supabaseUrl}/rest/v1/job_vehicles?job_id=eq.${job_id}&select=*,vehicles(year,make,model,vin)&order=sort_order`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Accept': 'application/json',
        },
      }
    )
    const jobVehicles = await jvRes.json()

    // 4. Build QB invoice lines
    const qbLines: any[] = []

    // Add vehicle description lines
    if (jobVehicles.length > 0) {
      const vehicleDescs = jobVehicles
        .filter((jv: any) => jv.vehicles)
        .map((jv: any) => {
          const v = jv.vehicles
          const parts = [v.year, v.make, v.model].filter(Boolean).join(' ')
          return v.vin ? `${parts} — VIN: ${v.vin}` : parts
        })

      if (vehicleDescs.length > 0) {
        qbLines.push({
          DetailType: 'DescriptionOnly',
          Description: vehicleDescs.join('\n'),
          DescriptionLineDetail: {},
        })
      }
    }

    // Add priced line items
    // Items without a qb_item_id need a fallback — we'll skip them and warn
    const skipped: string[] = []

    for (const li of lineItems) {
      const amount = (li.quantity || 1) * (li.unit_price || 0)

      if (!li.qb_item_id) {
        // No QB link — skip but warn
        skipped.push(li.description)
        continue
      }

      const line: any = {
        Amount: Math.round(amount * 100) / 100,
        Description: li.description || '',
        DetailType: 'SalesItemLineDetail',
        SalesItemLineDetail: {
          ItemRef: { value: li.qb_item_id },
          Qty: li.quantity || 1,
          UnitPrice: li.unit_price || 0,
        },
      }

      // Add line item notes to description
      if (li.notes) {
        line.Description = line.Description ? `${line.Description} — ${li.notes}` : li.notes
      }

      qbLines.push(line)
    }

    if (qbLines.filter((l: any) => l.DetailType === 'SalesItemLineDetail').length === 0) {
      return new Response(JSON.stringify({
        error: 'No line items have a QuickBooks item link. Make sure services are synced from QB.',
        skipped,
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // 5. Build and POST the invoice to QB
    const invoicePayload: any = {
      CustomerRef: { value: customer.qb_id },
      Line: qbLines,
      PrivateNote: `CRM Job ID: ${job_id}`,
    }

    // Add scheduled date as invoice date if available
    if (job.scheduled_start) {
      const d = new Date(job.scheduled_start)
      invoicePayload.TxnDate = d.toISOString().split('T')[0]
    }

    const { accessToken, realmId } = await getValidAccessToken(supabaseUrl, supabaseKey, clientId, clientSecret)

    const qbResponse = await fetch(
      `${QB_API_BASE}/company/${realmId}/invoice?minorversion=75`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(invoicePayload),
      }
    )

    const qbData = await qbResponse.json()

    if (!qbResponse.ok) {
      console.error('QB invoice creation failed:', JSON.stringify(qbData))
      const qbError = qbData?.Fault?.Error?.[0]
      return new Response(JSON.stringify({
        error: 'QuickBooks rejected the invoice',
        detail: qbError?.Detail || qbError?.Message || JSON.stringify(qbData),
      }), {
        status: 422,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const invoice = qbData.Invoice
    const invoiceId = invoice.Id
    const invoiceNumber = invoice.DocNumber || null
    const invoiceTotal = invoice.TotalAmt

    // 6. Update the job with QB invoice info + set status to invoiced
    await fetch(
      `${supabaseUrl}/rest/v1/jobs?id=eq.${job_id}`,
      {
        method: 'PATCH',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({
          qb_invoice_id: invoiceId,
          invoice_number: invoiceNumber,
          status: 'invoiced',
          updated_at: new Date().toISOString(),
        }),
      }
    )

    return new Response(JSON.stringify({
      success: true,
      invoice_id: invoiceId,
      invoice_number: invoiceNumber,
      total: invoiceTotal,
      skipped: skipped.length > 0 ? skipped : undefined,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })

  } catch (error: any) {
    console.error('Invoice creation error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
