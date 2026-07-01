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

  const supabaseUrl = Netlify.env.get('SUPABASE_URL')
  const supabaseKey = Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const clientId = Netlify.env.get('QB_CLIENT_ID')
  const clientSecret = Netlify.env.get('QB_CLIENT_SECRET')

  if (!supabaseUrl || !supabaseKey || !clientId || !clientSecret) {
    return new Response(JSON.stringify({ error: 'Missing env vars' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    const { accessToken, realmId } = await getValidAccessToken(supabaseUrl, supabaseKey, clientId, clientSecret)

    // Pull live P&L for current month
    const now = new Date()
    const year = now.getUTCFullYear()
    const month = now.getUTCMonth() // 0-indexed
    const startDate = `${year}-${String(month + 1).padStart(2, '0')}-01`
    const lastDay = new Date(year, month + 1, 0).getDate()
    const endDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
    const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`
    const today = now.toISOString().split('T')[0]
    const dayOfMonth = now.getUTCDate()

    const plUrl = `${QB_API_BASE}/company/${realmId}/reports/ProfitAndLoss?start_date=${startDate}&end_date=${endDate}&accounting_method=Accrual&minorversion=65`
    const plRes = await fetch(plUrl, {
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' },
    })
    if (!plRes.ok) throw new Error(`P&L report error: ${plRes.status}`)
    const plData = await plRes.json()

    let revenue = 0, netIncome = 0
    const rows = plData?.Rows?.Row || []
    for (const row of rows) {
      if (row.group === 'Income' && row.Summary) {
        revenue = parseFloat(row.Summary.ColData?.[1]?.value || '0')
      } else if (row.group === 'NetIncome' && row.Summary) {
        netIncome = parseFloat(row.Summary.ColData?.[1]?.value || '0')
      }
    }
    const totalExpenses = revenue - netIncome
    const profit = netIncome

    const FLOOR = 14000, TOP = 20000, MIN_RATE = 0.02, MAX_RATE = 0.04
    let bonusRate = 0
    if (profit >= TOP) {
      bonusRate = MAX_RATE
    } else if (profit >= FLOOR) {
      bonusRate = MIN_RATE + (MAX_RATE - MIN_RATE) * ((profit - FLOOR) / (TOP - FLOOR))
    }

    const snapshot = {
      month: monthKey,
      snapshot_date: today,
      revenue,
      expenses: totalExpenses,
      profit,
      bonus_rate: Math.round(bonusRate * 10000) / 10000,
      days_elapsed: dayOfMonth,
      days_in_month: lastDay,
    }

    // Upsert snapshot
    const snapshotRes = await fetch(`${supabaseUrl}/rest/v1/bonus_snapshots?on_conflict=month,snapshot_date`, {
      method: 'POST',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal,resolution=merge-duplicates',
      },
      body: JSON.stringify(snapshot),
    })
    if (!snapshotRes.ok) {
      console.error('Bonus snapshot upsert failed:', await snapshotRes.text().catch(() => 'unknown'))
    }

    // Now return all months (same as bonus-data endpoint)
    const { data: snapshots, error } = await (await import('@supabase/supabase-js')).createClient(supabaseUrl, supabaseKey)
      .from('bonus_snapshots')
      .select('*')
      .order('month', { ascending: false })
      .order('snapshot_date', { ascending: false })
      .limit(365)

    if (error) throw error

    const byMonth: Record<string, any> = {}
    for (const snap of (snapshots || [])) {
      if (!byMonth[snap.month]) {
        byMonth[snap.month] = snap
      }
    }

    const months = Object.values(byMonth)
      .sort((a: any, b: any) => b.month.localeCompare(a.month))
      .slice(0, 12)

    return new Response(JSON.stringify({ months }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    console.error('Bonus refresh error:', err.message)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }
}
