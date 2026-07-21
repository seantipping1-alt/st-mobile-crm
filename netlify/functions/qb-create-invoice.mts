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
    const { job_id, is_insurance } = await request.json()
    if (!job_id) {
      return new Response(JSON.stringify({ error: 'Missing job_id' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // 1. Load the job + customer
    const jobRes = await fetch(
      `${supabaseUrl}/rest/v1/jobs?id=eq.${job_id}&select=*,customers(id,name,qb_id),team!jobs_assigned_to_fkey(name)`,
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

    // Add 20% discount line for insurance jobs
    if (is_insurance) {
      const subtotal = qbLines
        .filter((l: any) => l.DetailType === 'SalesItemLineDetail')
        .reduce((sum: number, l: any) => sum + l.Amount, 0)
      const discountAmount = Math.round(subtotal * 0.20 * 100) / 100

      qbLines.push({
        Amount: discountAmount,
        DetailType: 'DiscountLineDetail',
        DiscountLineDetail: {
          PercentBased: true,
          DiscountPercent: 20,
        },
      })
    }

    // 5. Get QB auth and fetch customer details for email
    const { accessToken, realmId } = await getValidAccessToken(supabaseUrl, supabaseKey, clientId, clientSecret)

    // Fetch the QB customer to get their email address
    let billEmail: string | null = null
    try {
      const qbCustResponse = await fetch(
        `${QB_API_BASE}/company/${realmId}/customer/${customer.qb_id}?minorversion=75`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json',
          },
        }
      )
      if (qbCustResponse.ok) {
        const qbCustData = await qbCustResponse.json()
        billEmail = qbCustData.Customer?.PrimaryEmailAddr?.Address || null
      }
    } catch (e) {
      console.warn('Could not fetch QB customer email:', e)
    }

    // Fetch QB preferences to get correct custom field DefinitionIds
    // QB legacy custom fields use SalesFormsPrefs.SalesCustomName# for names
    // and SalesFormsPrefs.UseSalesCustom# for enabled/disabled status.
    // The # suffix IS the DefinitionId used when creating invoices.
    let vinDefId: string | null = null
    let techDefId: string | null = null
    try {
      const prefsResponse = await fetch(
        `${QB_API_BASE}/company/${realmId}/preferences?minorversion=75`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json',
          },
        }
      )
      if (prefsResponse.ok) {
        const prefsData = await prefsResponse.json()
        const salesCF = prefsData.Preferences?.SalesFormsPrefs?.CustomField || []

        // Build a map of enabled fields: { "1": true/false, "2": true/false, "3": true/false }
        const enabledMap: Record<string, boolean> = {}
        // Build a map of field names: { "1": "VIN", "2": "Tech", ... }
        const nameMap: Record<string, string> = {}

        for (const group of salesCF) {
          const fields = group.CustomField || []
          for (const cf of fields) {
            // "SalesFormsPrefs.UseSalesCustom1" -> extract "1", get boolean
            const enableMatch = cf.Name?.match(/UseSalesCustom(\d+)$/)
            if (enableMatch) {
              enabledMap[enableMatch[1]] = cf.BooleanValue === true
            }
            // "SalesFormsPrefs.SalesCustomName1" -> extract "1", get string value
            const nameMatch = cf.Name?.match(/SalesCustomName(\d+)$/)
            if (nameMatch && cf.StringValue) {
              nameMap[nameMatch[1]] = cf.StringValue
            }
          }
        }

        console.log('QB custom field names:', nameMap, 'enabled:', enabledMap)

        // Find which DefinitionId maps to VIN and Tech
        for (const [defId, fieldName] of Object.entries(nameMap)) {
          if (enabledMap[defId] !== false) {
            const lower = fieldName.toLowerCase()
            if (lower.includes('vin')) vinDefId = defId
            if (lower.includes('tech')) techDefId = defId
          }
        }
      }
    } catch (e) {
      console.warn('Could not fetch QB preferences for custom fields:', e)
    }

    // Build the invoice payload
    const siteUrl = Netlify.env.get('URL') || Netlify.env.get('DEPLOY_PRIME_URL') || ''
    const jobViewUrl = siteUrl ? `${siteUrl}/j/${job_id}` : ''

    const invoicePayload: any = {
      CustomerRef: { value: customer.qb_id },
      Line: qbLines,
      PrivateNote: `CRM Job ID: ${job_id}`,
      AutoDocNumber: true,
    }

    // Link invoice to estimate for insurance jobs
    if (is_insurance && job.qb_estimate_id) {
      invoicePayload.LinkedTxn = [{
        TxnId: job.qb_estimate_id,
        TxnType: 'Estimate',
      }]
    }

    // Customer-facing memo with link to job details and attachments
    if (jobViewUrl) {
      invoicePayload.CustomerMemo = {
        value: `View job details, photos, and scan reports:\n${jobViewUrl}`,
      }
    }

    // Set email from QB customer profile
    if (billEmail) {
      invoicePayload.BillEmail = { Address: billEmail }
    }

    // Custom fields: VIN and Tech — use discovered DefinitionIds, fall back to 1/2
    const customFields: any[] = []
    const firstVin = jobVehicles.find((jv: any) => jv.vehicles?.vin)?.vehicles?.vin
    if (firstVin) {
      customFields.push({
        DefinitionId: vinDefId || '1',
        StringValue: firstVin,
        Type: 'StringType',
        Name: 'VIN',
      })
    }
    const techName = job.team?.name
    if (techName) {
      customFields.push({
        DefinitionId: techDefId || '2',
        StringValue: techName,
        Type: 'StringType',
        Name: 'Tech',
      })
    }
    if (customFields.length > 0) {
      invoicePayload.CustomField = customFields
    }

    // Add scheduled date as invoice date if available
    if (job.scheduled_start) {
      const d = new Date(job.scheduled_start)
      invoicePayload.TxnDate = d.toISOString().split('T')[0]
    }

    // Create the invoice in QB — with retry logic for duplicate number collisions
    // This handles cases where invoices were created manually in QB (by Steve etc.)
    // and the auto-number sequence collides with existing numbers
    let qbData: any = null
    let qbResponse: Response | null = null
    const MAX_RETRIES = 5

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      qbResponse = await fetch(
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

      qbData = await qbResponse.json()

      if (qbResponse.ok) break // success

      // Check if it's a duplicate number error
      const qbError = qbData?.Fault?.Error?.[0]
      const isDuplicateNumber = qbError?.Detail?.includes('Duplicate Document Number') ||
        qbError?.code === '6140'

      if (isDuplicateNumber && attempt < MAX_RETRIES - 1) {
        // Find the highest existing invoice number in QB and set the next one
        console.warn(`Duplicate invoice number on attempt ${attempt + 1}, finding next available...`)
        try {
          const queryRes = await fetch(
            `${QB_API_BASE}/company/${realmId}/query?query=${encodeURIComponent("SELECT DocNumber FROM Invoice ORDER BY MetaData.CreateTime DESC MAXRESULTS 1")}`,
            {
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/json',
              },
            }
          )
          if (queryRes.ok) {
            const queryData = await queryRes.json()
            const latestNum = queryData?.QueryResponse?.Invoice?.[0]?.DocNumber
            if (latestNum && /^\d+$/.test(latestNum)) {
              const nextNum = String(parseInt(latestNum) + 1)
              console.log(`Setting explicit DocNumber=${nextNum} for retry`)
              delete invoicePayload.AutoDocNumber
              invoicePayload.DocNumber = nextNum
            }
          }
        } catch (e) {
          console.warn('Could not query latest invoice number:', e)
        }
        continue // retry
      }

      // Non-duplicate error or max retries — bail out
      break
    }

    if (!qbResponse!.ok) {
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

    // Capture the customer-facing payment link
    // QB returns InvoiceLink on the response, or we construct from the realm
    let invoiceLink = invoice.InvoiceLink || null

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
          qb_invoice_link: invoiceLink,
          qb_invoice_total: invoiceTotal,
          payment_status: 'unpaid',
          status: 'invoiced',
          updated_at: new Date().toISOString(),
        }),
      }
    )

    return new Response(JSON.stringify({
      success: true,
      invoice_id: invoiceId,
      invoice_number: invoiceNumber,
      invoice_link: invoiceLink,
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
