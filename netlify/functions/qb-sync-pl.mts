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

// Extract value from P&L group row
function extractGroupValue(rows: any[], groupName: string): number {
  for (const row of rows) {
    if (row.group === groupName && row.Summary) {
      return parseFloat(row.Summary.ColData?.[1]?.value || '0')
    }
  }
  return 0
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

    // Determine which months to sync
    // Default: current month only. Pass months=7 to backfill Jan-Jul etc.
    const now = new Date()
    const monthsBack = body.months || 1
    const results: any[] = []

    for (let i = 0; i < monthsBack; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const year = d.getFullYear()
      const month = d.getMonth()
      const startDate = `${year}-${String(month + 1).padStart(2, '0')}-01`
      const lastDay = new Date(year, month + 1, 0).getDate()
      const endDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
      const monthKey = `${year}-${String(month + 1).padStart(2, '0')}-01`

      console.log(`Fetching P&L for ${startDate} to ${endDate}...`)

      const plUrl = `${QB_API_BASE}/company/${realmId}/reports/ProfitAndLoss?start_date=${startDate}&end_date=${endDate}&accounting_method=Accrual&minorversion=65`
      const plRes = await fetch(plUrl, {
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' },
      })
      if (!plRes.ok) throw new Error(`P&L report error for ${startDate}: ${plRes.status}`)
      const plData = await plRes.json()

      const rows = plData?.Rows?.Row || []
      const revenue = extractGroupValue(rows, 'Income')
      const cogs = extractGroupValue(rows, 'COGS')
      const grossProfit = extractGroupValue(rows, 'GrossProfit')
      const expenses = extractGroupValue(rows, 'Expenses')
      const netIncome = extractGroupValue(rows, 'NetIncome')

      const plRow = {
        month: monthKey,
        revenue,
        cogs,
        gross_profit: grossProfit,
        expenses,
        net_income: netIncome,
        updated_at: new Date().toISOString(),
      }

      // Upsert
      const res = await fetch(`${supabaseUrl}/rest/v1/fin_monthly_pl?on_conflict=month`, {
        method: 'POST',
        headers: {
          'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json', 'Prefer': 'return=minimal,resolution=merge-duplicates',
        },
        body: JSON.stringify(plRow),
      })

      if (!res.ok) {
        console.error(`P&L upsert failed for ${monthKey}: ${await res.text().catch(() => 'unknown')}`)
      }

      results.push(plRow)
      console.log(`${monthKey}: Rev=${revenue} COGS=${cogs} Exp=${expenses} Net=${netIncome}`)
    }

    return new Response(JSON.stringify({ success: true, months: results }), { status: 200, headers: { 'Content-Type': 'application/json' } })

  } catch (error: any) {
    console.error('P&L sync error:', error)
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}
