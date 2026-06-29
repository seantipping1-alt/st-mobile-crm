import type { Context } from '@netlify/functions'

const QB_API_BASE = 'https://quickbooks.api.intuit.com/v3'

async function getTokens(supabaseUrl: string, supabaseKey: string) {
  const response = await fetch(
    `${supabaseUrl}/rest/v1/qb_tokens?order=updated_at.desc&limit=1`,
    { headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}`, 'Accept': 'application/json' } }
  )
  if (!response.ok) throw new Error(`Failed to fetch tokens: ${await response.text()}`)
  const tokens = await response.json()
  return tokens.length ? tokens[0] : null
}

async function refreshAccessToken(tokenRecord: any, supabaseUrl: string, supabaseKey: string, clientId: string, clientSecret: string) {
  const basicAuth = btoa(`${clientId}:${clientSecret}`)
  const response = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
    method: 'POST',
    headers: { 'Authorization': `Basic ${basicAuth}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: tokenRecord.refresh_token }),
  })
  if (!response.ok) throw new Error(`Token refresh failed: ${await response.text()}`)
  const tokens = await response.json()
  const now = new Date()
  const expiresAt = new Date(now.getTime() + tokens.expires_in * 1000).toISOString()
  await fetch(`${supabaseUrl}/rest/v1/qb_tokens?id=eq.${tokenRecord.id}`, {
    method: 'PATCH',
    headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
    body: JSON.stringify({ access_token: tokens.access_token, refresh_token: tokens.refresh_token, expires_at: expiresAt, updated_at: now.toISOString() }),
  })
  return tokens.access_token
}

async function getValidAccessToken(supabaseUrl: string, supabaseKey: string, clientId: string, clientSecret: string) {
  const tokenRecord = await getTokens(supabaseUrl, supabaseKey)
  if (!tokenRecord) throw new Error('QuickBooks not connected')
  let accessToken = tokenRecord.access_token
  const expiresAt = new Date(tokenRecord.expires_at)
  if (new Date().getTime() >= expiresAt.getTime() - 5 * 60 * 1000) {
    accessToken = await refreshAccessToken(tokenRecord, supabaseUrl, supabaseKey, clientId, clientSecret)
  }
  return { accessToken, realmId: tokenRecord.realm_id }
}

export default async (_request: Request, _context: Context) => {
  const supabaseUrl = Netlify.env.get('SUPABASE_URL')
  const supabaseKey = Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const clientId = Netlify.env.get('QB_CLIENT_ID')
  const clientSecret = Netlify.env.get('QB_CLIENT_SECRET')

  if (!supabaseUrl || !supabaseKey || !clientId || !clientSecret) {
    return new Response('Missing env vars', { status: 500 })
  }

  const { accessToken, realmId } = await getValidAccessToken(supabaseUrl, supabaseKey, clientId, clientSecret)

  const now = new Date()
  const startDate = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`
  const lastDay = new Date(now.getUTCFullYear(), now.getUTCMonth() + 1, 0).getDate()
  const endDate = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  const plUrl = `${QB_API_BASE}/company/${realmId}/reports/ProfitAndLoss?start_date=${startDate}&end_date=${endDate}&accounting_method=Accrual&minorversion=65`
  const plRes = await fetch(plUrl, {
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' },
  })
  if (!plRes.ok) return new Response(`P&L error: ${plRes.status}`, { status: 500 })
  const plData = await plRes.json()

  // Return just the top-level row groups and their summaries
  const sections = (plData?.Rows?.Row || []).map((row: any) => ({
    group: row.group || row.type || 'unknown',
    header: row.Header?.ColData?.[0]?.value || null,
    summary: row.Summary?.ColData?.map((c: any) => c.value) || null,
    subRows: row.Rows?.Row?.map((sub: any) => ({
      type: sub.type,
      group: sub.group,
      header: sub.Header?.ColData?.[0]?.value || null,
      summary: sub.Summary?.ColData?.map((c: any) => c.value) || null,
      cells: sub.ColData?.map((c: any) => c.value) || null,
    })) || null,
  }))

  return new Response(JSON.stringify({ startDate, endDate, sections }, null, 2), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  })
}
