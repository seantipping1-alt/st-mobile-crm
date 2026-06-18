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
    const { invoice_number } = await request.json()
    if (!invoice_number?.trim()) {
      return new Response(JSON.stringify({ error: 'Missing invoice_number' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const docNum = invoice_number.trim()

    // 1. Check if this invoice is already imported
    const existingRes = await fetch(
      `${supabaseUrl}/rest/v1/jobs?invoice_number=eq.${encodeURIComponent(docNum)}&select=id,invoice_number&limit=1`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Accept': 'application/json',
        },
      }
    )
    const existingJobs = await existingRes.json()
    if (existingJobs.length > 0) {
      return new Response(JSON.stringify({
        error: `Invoice #${docNum} is already linked to a job`,
        job_id: existingJobs[0].id,
      }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // 2. Get QB auth and look up the invoice
    const { accessToken, realmId } = await getValidAccessToken(supabaseUrl, supabaseKey, clientId, clientSecret)

    const query = `SELECT * FROM Invoice WHERE DocNumber = '${docNum}'`
    const qbRes = await fetch(
      `${QB_API_BASE}/company/${realmId}/query?query=${encodeURIComponent(query)}&minorversion=75`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
        },
      }
    )
    if (!qbRes.ok) {
      const errText = await qbRes.text()
      console.error('QB query failed:', errText)
      return new Response(JSON.stringify({ error: 'Failed to query QuickBooks' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const qbData = await qbRes.json()
    const invoices = qbData?.QueryResponse?.Invoice || []
    if (invoices.length === 0) {
      return new Response(JSON.stringify({ error: `No invoice found with number "${docNum}"` }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const invoice = invoices[0]
    const qbCustomerId = invoice.CustomerRef?.value
    const qbCustomerName = invoice.CustomerRef?.name || 'Unknown'

    // 3. Extract VIN from custom fields
    let vin: string | null = null
    if (invoice.CustomField) {
      for (const cf of invoice.CustomField) {
        if (cf.Name?.toLowerCase().includes('vin') && cf.StringValue) {
          vin = cf.StringValue.toUpperCase().trim()
          break
        }
      }
    }

    // 4. Find or create the customer in CRM
    let customerId: string | null = null
    if (qbCustomerId) {
      // Look up by qb_id
      const custRes = await fetch(
        `${supabaseUrl}/rest/v1/customers?qb_id=eq.${qbCustomerId}&select=id&limit=1`,
        {
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Accept': 'application/json',
          },
        }
      )
      const customers = await custRes.json()
      if (customers.length > 0) {
        customerId = customers[0].id
      } else {
        // Fetch full customer from QB and create in CRM
        const qbCustRes = await fetch(
          `${QB_API_BASE}/company/${realmId}/customer/${qbCustomerId}?minorversion=75`,
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Accept': 'application/json',
            },
          }
        )
        if (qbCustRes.ok) {
          const qbCustData = await qbCustRes.json()
          const c = qbCustData.Customer
          const isCompany = !!(c.CompanyName && c.CompanyName !== c.DisplayName)
          const createRes = await fetch(
            `${supabaseUrl}/rest/v1/customers`,
            {
              method: 'POST',
              headers: {
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=representation',
              },
              body: JSON.stringify({
                name: c.DisplayName || qbCustomerName,
                customer_type: isCompany ? 'shop' : 'individual',
                email: c.PrimaryEmailAddr?.Address || null,
                phone: c.PrimaryPhone?.FreeFormNumber || null,
                address: c.BillAddr
                  ? [c.BillAddr.Line1, c.BillAddr.City, c.BillAddr.CountrySubDivisionCode, c.BillAddr.PostalCode].filter(Boolean).join(', ')
                  : null,
                qb_id: qbCustomerId,
              }),
            }
          )
          if (createRes.ok) {
            const created = await createRes.json()
            customerId = created[0]?.id || created.id
          }
        }
      }
    }

    if (!customerId) {
      return new Response(JSON.stringify({
        error: 'Could not find or create customer in CRM. Try syncing customers from QB first.',
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // 5. Determine job type from line items
    // Load CRM services to match QB item IDs
    const svcRes = await fetch(
      `${supabaseUrl}/rest/v1/services?select=id,name,qb_item_id,category,default_rate&is_active=eq.true`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Accept': 'application/json',
        },
      }
    )
    const services = await svcRes.json()
    const svcByQbId: Record<string, any> = {}
    for (const s of services) {
      if (s.qb_item_id) svcByQbId[s.qb_item_id] = s
    }

    // Parse invoice line items
    const lineItems: any[] = []
    const categories: string[] = []

    for (const line of invoice.Line || []) {
      if (line.DetailType === 'SalesItemLineDetail') {
        const itemId = line.SalesItemLineDetail?.ItemRef?.value
        const matchedService = itemId ? svcByQbId[itemId] : null
        const qty = line.SalesItemLineDetail?.Qty || 1
        const unitPrice = line.SalesItemLineDetail?.UnitPrice || 0

        lineItems.push({
          service_id: matchedService?.id || null,
          description: line.Description || matchedService?.name || 'Unknown item',
          quantity: qty,
          unit_price: unitPrice,
          category: 'labor',
          qb_item_id: itemId || null,
          notes: null,
        })

        if (matchedService?.category) {
          categories.push(matchedService.category)
        }
      }
      // Skip DescriptionOnly, SubTotalLineDetail, DiscountLineDetail etc.
    }

    // Determine job type from most common category
    let jobType = 'diagnostic' // default
    if (categories.length > 0) {
      const catCounts: Record<string, number> = {}
      for (const c of categories) {
        catCounts[c] = (catCounts[c] || 0) + 1
      }
      jobType = Object.entries(catCounts).sort((a, b) => b[1] - a[1])[0][0]
    }

    // Check if this is an insurance job (has discount line)
    const hasDiscount = (invoice.Line || []).some(
      (l: any) => l.DetailType === 'DiscountLineDetail'
    )

    // 6. Create the job
    const txnDate = invoice.TxnDate // e.g. "2025-06-15"
    const jobPayload: any = {
      customer_id: customerId,
      job_type: jobType,
      status: 'invoiced',
      qb_invoice_id: invoice.Id,
      invoice_number: docNum,
      qb_invoice_total: invoice.TotalAmt || null,
      qb_invoice_link: invoice.InvoiceLink || null,
      payment_status: invoice.Balance === 0 ? 'paid' : 'unpaid',
      is_insurance: hasDiscount,
    }
    if (txnDate) {
      jobPayload.scheduled_start = `${txnDate}T12:00:00.000Z`
    }

    const jobRes = await fetch(
      `${supabaseUrl}/rest/v1/jobs`,
      {
        method: 'POST',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation',
        },
        body: JSON.stringify(jobPayload),
      }
    )
    if (!jobRes.ok) {
      const errText = await jobRes.text()
      console.error('Job creation failed:', errText)
      return new Response(JSON.stringify({ error: 'Failed to create job in CRM' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const jobData = await jobRes.json()
    const jobId = jobData[0]?.id || jobData.id

    // 7. Add vehicle if VIN found
    let vehicleId: string | null = null
    if (vin && vin.length === 17) {
      // Check if vehicle already exists for this customer
      const vehCheckRes = await fetch(
        `${supabaseUrl}/rest/v1/vehicles?vin=eq.${vin}&select=id&limit=1`,
        {
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Accept': 'application/json',
          },
        }
      )
      const existingVehicles = await vehCheckRes.json()

      if (existingVehicles.length > 0) {
        vehicleId = existingVehicles[0].id
      } else {
        // Decode VIN and create vehicle
        let year = '', make = '', model = '', engine = ''
        try {
          const nhtsaRes = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/decodevin/${vin}?format=json`)
          const nhtsaData = await nhtsaRes.json()
          const getVal = (name: string) => nhtsaData.Results?.find((r: any) => r.Variable === name)?.Value || ''
          year = getVal('Model Year'); make = getVal('Make'); model = getVal('Model'); engine = getVal('Engine Model')
        } catch (_) {}

        const vehCreateRes = await fetch(
          `${supabaseUrl}/rest/v1/vehicles`,
          {
            method: 'POST',
            headers: {
              'apikey': supabaseKey,
              'Authorization': `Bearer ${supabaseKey}`,
              'Content-Type': 'application/json',
              'Prefer': 'return=representation',
            },
            body: JSON.stringify({
              customer_id: customerId,
              vin,
              year: parseInt(year) || null,
              make: make || null,
              model: model || null,
              engine: engine || null,
            }),
          }
        )
        if (vehCreateRes.ok) {
          const vehData = await vehCreateRes.json()
          vehicleId = vehData[0]?.id || vehData.id
        }
      }

      if (vehicleId) {
        // Link vehicle to job
        await fetch(`${supabaseUrl}/rest/v1/job_vehicles`, {
          method: 'POST',
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal',
          },
          body: JSON.stringify({ job_id: jobId, vehicle_id: vehicleId, sort_order: 0 }),
        })
        // Set vehicle_id on job
        await fetch(`${supabaseUrl}/rest/v1/jobs?id=eq.${jobId}`, {
          method: 'PATCH',
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal',
          },
          body: JSON.stringify({ vehicle_id: vehicleId }),
        })
      }
    }

    // 8. Insert line items
    if (lineItems.length > 0) {
      const liRows = lineItems.map((li, i) => ({
        job_id: jobId,
        vehicle_id: vehicleId,
        service_id: li.service_id,
        description: li.description,
        quantity: li.quantity,
        unit_price: li.unit_price,
        category: li.category,
        qb_item_id: li.qb_item_id,
        notes: li.notes,
        sort_order: i,
      }))

      await fetch(`${supabaseUrl}/rest/v1/job_line_items`, {
        method: 'POST',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify(liRows),
      })
    }

    return new Response(JSON.stringify({
      success: true,
      job_id: jobId,
      customer_name: qbCustomerName,
      invoice_number: docNum,
      invoice_total: invoice.TotalAmt,
      line_items_count: lineItems.length,
      vehicle_vin: vin,
      is_insurance: hasDiscount,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })

  } catch (error: any) {
    console.error('Import invoice error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
