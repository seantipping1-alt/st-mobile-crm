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
  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    })
  }

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
    const { job_id, payment_method } = await request.json()

    if (!job_id) {
      return new Response(JSON.stringify({ error: 'Missing job_id' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (!payment_method || !['cash', 'check'].includes(payment_method)) {
      return new Response(JSON.stringify({ error: 'Invalid payment_method. Must be "cash" or "check".' }), {
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

    // Validate job has a QB invoice
    if (!job.qb_invoice_id) {
      return new Response(JSON.stringify({ error: 'Job has no QuickBooks invoice. Create an invoice first.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Check if already paid
    if (job.payment_status === 'paid' && job.qb_payment_id) {
      return new Response(JSON.stringify({ error: 'Payment already recorded', qb_payment_id: job.qb_payment_id }), {
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

    const invoiceTotal = job.qb_invoice_total
    if (!invoiceTotal || invoiceTotal <= 0) {
      return new Response(JSON.stringify({ error: 'Invoice total is missing or zero' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // 2. Get QB auth
    const { accessToken, realmId } = await getValidAccessToken(supabaseUrl, supabaseKey, clientId, clientSecret)

    // 3. Look up PaymentMethod in QB (Cash / Check are standard)
    let paymentMethodRefValue: string | null = null
    try {
      const methodQuery = encodeURIComponent(
        `SELECT * FROM PaymentMethod WHERE Name = '${payment_method === 'cash' ? 'Cash' : 'Check'}'`
      )
      const pmRes = await fetch(
        `${QB_API_BASE}/company/${realmId}/query?query=${methodQuery}&minorversion=75`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json',
          },
        }
      )
      if (pmRes.ok) {
        const pmData = await pmRes.json()
        const methods = pmData.QueryResponse?.PaymentMethod
        if (methods && methods.length > 0) {
          paymentMethodRefValue = methods[0].Id
        }
      }
    } catch (e) {
      console.warn('Could not query PaymentMethod from QB, proceeding without PaymentMethodRef:', e)
    }

    // 4. Create Payment in QB
    const paymentPayload: any = {
      CustomerRef: { value: customer.qb_id },
      TotalAmt: invoiceTotal,
      Line: [
        {
          Amount: invoiceTotal,
          LinkedTxn: [
            {
              TxnId: job.qb_invoice_id,
              TxnType: 'Invoice',
            },
          ],
        },
      ],
    }

    if (paymentMethodRefValue) {
      paymentPayload.PaymentMethodRef = {
        value: paymentMethodRefValue,
        name: payment_method === 'cash' ? 'Cash' : 'Check',
      }
    }

    const qbResponse = await fetch(
      `${QB_API_BASE}/company/${realmId}/payment?minorversion=75`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(paymentPayload),
      }
    )

    const qbData = await qbResponse.json()

    if (!qbResponse.ok) {
      console.error('QB payment creation failed:', JSON.stringify(qbData))
      const qbError = qbData?.Fault?.Error?.[0]
      return new Response(JSON.stringify({
        error: 'QuickBooks rejected the payment',
        detail: qbError?.Detail || qbError?.Message || JSON.stringify(qbData),
      }), {
        status: 422,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const payment = qbData.Payment
    const paymentId = payment.Id

    // 5. Update the job in Supabase
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
          payment_status: 'paid',
          status: 'paid',
          qb_payment_id: paymentId,
          payment_method: payment_method,
          updated_at: new Date().toISOString(),
        }),
      }
    )

    // 6. Fetch updated customer balance from QB and update in Supabase
    try {
      const custRes = await fetch(
        `${QB_API_BASE}/company/${realmId}/customer/${customer.qb_id}?minorversion=75`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json',
          },
        }
      )
      if (custRes.ok) {
        const custData = await custRes.json()
        const balance = custData.Customer?.Balance ?? null
        if (balance !== null) {
          await fetch(
            `${supabaseUrl}/rest/v1/customers?id=eq.${customer.id}`,
            {
              method: 'PATCH',
              headers: {
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal',
              },
              body: JSON.stringify({
                qb_balance: balance,
                updated_at: new Date().toISOString(),
              }),
            }
          )
        }
      }
    } catch (e) {
      console.warn('Could not update customer balance:', e)
    }

    return new Response(JSON.stringify({
      success: true,
      payment_id: paymentId,
      payment_method: payment_method,
      total: invoiceTotal,
      invoice_id: job.qb_invoice_id,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })

  } catch (error: any) {
    console.error('Payment recording error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
