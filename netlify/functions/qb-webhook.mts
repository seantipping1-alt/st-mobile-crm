import type { Context } from '@netlify/functions'
import { createHmac } from 'crypto'

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

function verifyWebhookSignature(payload: string, signature: string, verifierToken: string): boolean {
  const hash = createHmac('sha256', verifierToken)
    .update(payload)
    .digest('base64')
  return hash === signature
}

export default async (request: Request, _context: Context) => {
  // QB webhooks only POST
  if (request.method !== 'POST') {
    return new Response('OK', { status: 200 })
  }

  const supabaseUrl = Netlify.env.get('SUPABASE_URL')
  const supabaseKey = Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const clientId = Netlify.env.get('QB_CLIENT_ID')
  const clientSecret = Netlify.env.get('QB_CLIENT_SECRET')
  const verifierToken = Netlify.env.get('QB_WEBHOOK_VERIFIER_TOKEN')

  if (!supabaseUrl || !supabaseKey || !clientId || !clientSecret || !verifierToken) {
    console.error('QB webhook: missing env vars')
    return new Response('OK', { status: 200 })
  }

  const rawBody = await request.text()
  const signature = request.headers.get('intuit-signature') || ''

  // Verify webhook signature
  if (!verifyWebhookSignature(rawBody, signature, verifierToken)) {
    console.warn('QB webhook: invalid signature')
    // Return 200 anyway — QB retries on non-200 and we don't want retry storms
    return new Response('OK', { status: 200 })
  }

  let payload: any
  try {
    payload = JSON.parse(rawBody)
  } catch {
    console.error('QB webhook: invalid JSON')
    return new Response('OK', { status: 200 })
  }

  // Process events — we care about Payment events
  const notifications = payload.eventNotifications || []

  for (const notification of notifications) {
    const events = notification.dataChangeEvent?.entities || []

    for (const entity of events) {
      if (entity.name === 'Payment' && (entity.operation === 'Create' || entity.operation === 'Update')) {
        try {
          await processPayment(entity.id, supabaseUrl, supabaseKey, clientId, clientSecret)
        } catch (err: any) {
          console.error(`QB webhook: error processing payment ${entity.id}:`, err.message)
        }
      }

      // Also handle invoice updates (e.g. voided invoices)
      if (entity.name === 'Invoice' && entity.operation === 'Update') {
        try {
          await processInvoiceUpdate(entity.id, supabaseUrl, supabaseKey, clientId, clientSecret)
        } catch (err: any) {
          console.error(`QB webhook: error processing invoice update ${entity.id}:`, err.message)
        }
      }
    }
  }

  // QB requires 200 response within 10 seconds
  return new Response('OK', { status: 200 })
}

async function processPayment(
  paymentId: string,
  supabaseUrl: string,
  supabaseKey: string,
  clientId: string,
  clientSecret: string
) {
  const { accessToken, realmId } = await getValidAccessToken(supabaseUrl, supabaseKey, clientId, clientSecret)

  // Fetch the payment from QB
  const paymentRes = await fetch(
    `${QB_API_BASE}/company/${realmId}/payment/${paymentId}?minorversion=75`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
    }
  )

  if (!paymentRes.ok) {
    throw new Error(`Failed to fetch payment ${paymentId}: ${paymentRes.status}`)
  }

  const paymentData = await paymentRes.json()
  const payment = paymentData.Payment

  if (!payment?.Line) return

  // Each payment line references invoices it applies to
  for (const line of payment.Line) {
    if (line.LinkedTxn) {
      for (const txn of line.LinkedTxn) {
        if (txn.TxnType === 'Invoice') {
          const qbInvoiceId = txn.TxnId

          // Look up the job by qb_invoice_id
          const jobRes = await fetch(
            `${supabaseUrl}/rest/v1/jobs?qb_invoice_id=eq.${qbInvoiceId}&select=id,payment_status`,
            {
              headers: {
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`,
                'Accept': 'application/json',
              },
            }
          )
          const jobs = await jobRes.json()

          if (jobs.length > 0) {
            const job = jobs[0]

            // Check the invoice balance in QB to determine paid/partial
            const invRes = await fetch(
              `${QB_API_BASE}/company/${realmId}/invoice/${qbInvoiceId}?minorversion=75`,
              {
                headers: {
                  'Authorization': `Bearer ${accessToken}`,
                  'Accept': 'application/json',
                },
              }
            )

            let paymentStatus = 'partial'
            if (invRes.ok) {
              const invData = await invRes.json()
              const balance = invData.Invoice?.Balance ?? 0
              paymentStatus = balance <= 0 ? 'paid' : 'partial'
            }

            // Update the job
            const updateBody: any = {
              payment_status: paymentStatus,
              qb_payment_id: paymentId,
              updated_at: new Date().toISOString(),
            }

            // If fully paid, also update job status
            if (paymentStatus === 'paid') {
              updateBody.status = 'paid'
            }

            await fetch(
              `${supabaseUrl}/rest/v1/jobs?id=eq.${job.id}`,
              {
                method: 'PATCH',
                headers: {
                  'apikey': supabaseKey,
                  'Authorization': `Bearer ${supabaseKey}`,
                  'Content-Type': 'application/json',
                  'Prefer': 'return=minimal',
                },
                body: JSON.stringify(updateBody),
              }
            )

            console.log(`QB webhook: job ${job.id} payment_status -> ${paymentStatus}`)
          }
        }
      }
    }
  }
}

async function processInvoiceUpdate(
  invoiceId: string,
  supabaseUrl: string,
  supabaseKey: string,
  clientId: string,
  clientSecret: string
) {
  const { accessToken, realmId } = await getValidAccessToken(supabaseUrl, supabaseKey, clientId, clientSecret)

  // Fetch the invoice to check its status
  const invRes = await fetch(
    `${QB_API_BASE}/company/${realmId}/invoice/${invoiceId}?minorversion=75`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
    }
  )

  if (!invRes.ok) return

  const invData = await invRes.json()
  const invoice = invData.Invoice

  // Look up our job
  const jobRes = await fetch(
    `${supabaseUrl}/rest/v1/jobs?qb_invoice_id=eq.${invoiceId}&select=id,payment_status,qb_invoice_link`,
    {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Accept': 'application/json',
      },
    }
  )
  const jobs = await jobRes.json()
  if (jobs.length === 0) return

  const job = jobs[0]
  const updateBody: any = { updated_at: new Date().toISOString() }

  // Update invoice link if we didn't have it before
  if (!job.qb_invoice_link && invoice.InvoiceLink) {
    updateBody.qb_invoice_link = invoice.InvoiceLink
  }

  // Always sync the QB invoice total so portal/job summary stays accurate
  if (invoice.TotalAmt != null) {
    updateBody.qb_invoice_total = invoice.TotalAmt
  }

  // Check balance for payment status
  const balance = invoice.Balance ?? 0
  if (balance <= 0 && invoice.TotalAmt > 0) {
    updateBody.payment_status = 'paid'
    updateBody.status = 'paid'
  } else if (balance < invoice.TotalAmt) {
    updateBody.payment_status = 'partial'
  }

  // Handle voided invoices
  if (invoice.PrivateNote?.includes('Voided')) {
    updateBody.payment_status = 'voided'
  }

  await fetch(
    `${supabaseUrl}/rest/v1/jobs?id=eq.${job.id}`,
    {
      method: 'PATCH',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify(updateBody),
    }
  )

  console.log(`QB webhook: invoice update for job ${job.id}`, updateBody)
}
