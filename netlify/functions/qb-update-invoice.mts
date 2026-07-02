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
      status: 405, headers: { 'Content-Type': 'application/json' },
    })
  }

  const clientId = Netlify.env.get('QB_CLIENT_ID')
  const clientSecret = Netlify.env.get('QB_CLIENT_SECRET')
  const supabaseUrl = Netlify.env.get('SUPABASE_URL')
  const supabaseKey = Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!clientId || !clientSecret || !supabaseUrl || !supabaseKey) {
    return new Response(JSON.stringify({ error: 'Missing required environment variables' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    const { job_id } = await request.json()
    if (!job_id) {
      return new Response(JSON.stringify({ error: 'Missing job_id' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      })
    }

    // 1. Load job + customer + team
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
        status: 404, headers: { 'Content-Type': 'application/json' },
      })
    }
    const job = jobs[0]

    if (!job.qb_invoice_id) {
      return new Response(JSON.stringify({ error: 'No QB invoice to update — send invoice first' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      })
    }

    const customer = job.customers
    if (!customer?.qb_id) {
      return new Response(JSON.stringify({ error: 'Customer has no QuickBooks link' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      })
    }

    // 2. Load current CRM line items
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
        status: 400, headers: { 'Content-Type': 'application/json' },
      })
    }

    // 3. Load vehicles
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

    // 4. Get QB auth
    const { accessToken, realmId } = await getValidAccessToken(supabaseUrl, supabaseKey, clientId, clientSecret)

    // 5. Fetch existing QB invoice to get SyncToken (required for updates)
    const existingRes = await fetch(
      `${QB_API_BASE}/company/${realmId}/invoice/${job.qb_invoice_id}?minorversion=75`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
        },
      }
    )
    if (!existingRes.ok) {
      throw new Error(`Failed to fetch existing invoice: ${existingRes.status}`)
    }
    const existingData = await existingRes.json()
    const existingInvoice = existingData.Invoice
    const syncToken = existingInvoice.SyncToken

    // 6. Build updated line items (same logic as create)
    const qbLines: any[] = []

    // Vehicle description lines
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

    // Priced line items
    const skipped: string[] = []
    for (const li of lineItems) {
      const amount = (li.quantity || 1) * (li.unit_price || 0)

      if (!li.qb_item_id) {
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

      if (li.notes) {
        line.Description = line.Description ? `${line.Description} — ${li.notes}` : li.notes
      }

      qbLines.push(line)
    }

    if (qbLines.filter((l: any) => l.DetailType === 'SalesItemLineDetail').length === 0) {
      return new Response(JSON.stringify({
        error: 'No line items have a QuickBooks item link',
        skipped,
      }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      })
    }

    // Insurance discount — check if original had one
    const isInsurance = job.is_insurance || existingInvoice.Line?.some((l: any) => l.DetailType === 'DiscountLineDetail')
    if (isInsurance) {
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

    // 7. Fetch QB preferences for custom field DefinitionIds
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
        const enabledMap: Record<string, boolean> = {}
        const nameMap: Record<string, string> = {}

        for (const group of salesCF) {
          const fields = group.CustomField || []
          for (const cf of fields) {
            const enableMatch = cf.Name?.match(/UseSalesCustom(\d+)$/)
            if (enableMatch) {
              enabledMap[enableMatch[1]] = cf.BooleanValue === true
            }
            const nameMatch = cf.Name?.match(/SalesCustomName(\d+)$/)
            if (nameMatch && cf.StringValue) {
              nameMap[nameMatch[1]] = cf.StringValue
            }
          }
        }

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

    // 8. Build update payload — QB requires full sparse update for invoices
    const siteUrl = Netlify.env.get('URL') || Netlify.env.get('DEPLOY_PRIME_URL') || ''
    const jobViewUrl = siteUrl ? `${siteUrl}/j/${job_id}` : ''

    const updatePayload: any = {
      Id: job.qb_invoice_id,
      SyncToken: syncToken,
      CustomerRef: { value: customer.qb_id },
      Line: qbLines,
      PrivateNote: `CRM Job ID: ${job_id}`,
    }

    // Preserve linked estimate
    if (job.qb_estimate_id) {
      updatePayload.LinkedTxn = [{
        TxnId: job.qb_estimate_id,
        TxnType: 'Estimate',
      }]
    }

    if (jobViewUrl) {
      updatePayload.CustomerMemo = {
        value: `View job details, photos, and scan reports:\n${jobViewUrl}`,
      }
    }

    // Custom fields
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
      updatePayload.CustomField = customFields
    }

    // 9. Send the update to QB
    const qbResponse = await fetch(
      `${QB_API_BASE}/company/${realmId}/invoice?minorversion=75`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(updatePayload),
      }
    )

    const qbData = await qbResponse.json()

    if (!qbResponse.ok) {
      console.error('QB invoice update failed:', JSON.stringify(qbData))
      const qbError = qbData?.Fault?.Error?.[0]
      return new Response(JSON.stringify({
        error: 'QuickBooks rejected the update',
        detail: qbError?.Detail || qbError?.Message || JSON.stringify(qbData),
      }), {
        status: 422, headers: { 'Content-Type': 'application/json' },
      })
    }

    const invoice = qbData.Invoice
    const invoiceTotal = invoice.TotalAmt

    // 10. Update CRM with new total
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
          qb_invoice_total: invoiceTotal,
          updated_at: new Date().toISOString(),
        }),
      }
    )

    return new Response(JSON.stringify({
      success: true,
      invoice_number: invoice.DocNumber || null,
      total: invoiceTotal,
      skipped: skipped.length > 0 ? skipped : undefined,
    }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    })

  } catch (error: any) {
    console.error('Invoice update error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }
}
