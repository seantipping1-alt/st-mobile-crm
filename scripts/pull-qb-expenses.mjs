// Pull 6 months of QB expenses with vendor details
// Uses the same token handling as the Netlify functions

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const QB_CLIENT_ID = process.env.QB_CLIENT_ID
const QB_CLIENT_SECRET = process.env.QB_CLIENT_SECRET
const QB_API_BASE = 'https://quickbooks.api.intuit.com/v3'

async function getTokens() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/qb_tokens?order=updated_at.desc&limit=1`, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Accept': 'application/json' }
  })
  const tokens = await res.json()
  return tokens[0]
}

async function refreshToken(record) {
  const basicAuth = btoa(`${QB_CLIENT_ID}:${QB_CLIENT_SECRET}`)
  const res = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
    method: 'POST',
    headers: { 'Authorization': `Basic ${basicAuth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: record.refresh_token })
  })
  const tokens = await res.json()
  await fetch(`${SUPABASE_URL}/rest/v1/qb_tokens?id=eq.${record.id}`, {
    method: 'PATCH',
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
    body: JSON.stringify({ access_token: tokens.access_token, refresh_token: tokens.refresh_token, expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(), updated_at: new Date().toISOString() })
  })
  return tokens.access_token
}

async function getAccessToken() {
  const record = await getTokens()
  if (!record) throw new Error('No QB tokens')
  const expires = new Date(record.expires_at)
  if (Date.now() >= expires.getTime() - 5 * 60000) {
    return { token: await refreshToken(record), realmId: record.realm_id }
  }
  return { token: record.access_token, realmId: record.realm_id }
}

async function qbQuery(token, realmId, query) {
  const url = `${QB_API_BASE}/company/${realmId}/query?query=${encodeURIComponent(query)}`
  const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' } })
  if (!res.ok) throw new Error(`QB query failed: ${res.status} ${await res.text()}`)
  return res.json()
}

async function main() {
  const { token, realmId } = await getAccessToken()
  
  // Pull purchases (bills, expenses, checks) from last 6 months
  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
  const startDate = sixMonthsAgo.toISOString().split('T')[0]
  
  // QB Purchase objects cover expenses, checks, credit card charges
  const allPurchases = []
  let startPos = 1
  const pageSize = 100
  
  while (true) {
    const data = await qbQuery(token, realmId, 
      `SELECT * FROM Purchase WHERE TxnDate >= '${startDate}' STARTPOSITION ${startPos} MAXRESULTS ${pageSize}`)
    const purchases = data?.QueryResponse?.Purchase || []
    allPurchases.push(...purchases)
    if (purchases.length < pageSize) break
    startPos += pageSize
  }
  
  // Also pull Bills (vendor bills)
  const allBills = []
  startPos = 1
  while (true) {
    const data = await qbQuery(token, realmId,
      `SELECT * FROM Bill WHERE TxnDate >= '${startDate}' STARTPOSITION ${startPos} MAXRESULTS ${pageSize}`)
    const bills = data?.QueryResponse?.Bill || []
    allBills.push(...bills)
    if (bills.length < pageSize) break
    startPos += pageSize
  }
  
  // Extract vendor -> category -> amount from purchases
  const vendorTotals = {}
  
  for (const p of allPurchases) {
    const vendor = p.EntityRef?.name || '(No vendor)'
    const date = p.TxnDate
    const lines = p.Line || []
    
    for (const line of lines) {
      const detail = line.AccountBasedExpenseLineDetail || line.ItemBasedExpenseLineDetail
      const accountName = detail?.AccountRef?.name || detail?.ItemRef?.name || '(uncategorized)'
      const amount = line.Amount || 0
      
      if (!vendorTotals[vendor]) vendorTotals[vendor] = { total: 0, count: 0, categories: {}, firstDate: date, lastDate: date }
      vendorTotals[vendor].total += amount
      vendorTotals[vendor].count++
      vendorTotals[vendor].categories[accountName] = (vendorTotals[vendor].categories[accountName] || 0) + amount
      if (date < vendorTotals[vendor].firstDate) vendorTotals[vendor].firstDate = date
      if (date > vendorTotals[vendor].lastDate) vendorTotals[vendor].lastDate = date
    }
  }
  
  for (const b of allBills) {
    const vendor = b.VendorRef?.name || '(No vendor)'
    const date = b.TxnDate
    const lines = b.Line || []
    
    for (const line of lines) {
      const detail = line.AccountBasedExpenseLineDetail || line.ItemBasedExpenseLineDetail
      const accountName = detail?.AccountRef?.name || detail?.ItemRef?.name || '(uncategorized)'
      const amount = line.Amount || 0
      
      if (!vendorTotals[vendor]) vendorTotals[vendor] = { total: 0, count: 0, categories: {}, firstDate: date, lastDate: date }
      vendorTotals[vendor].total += amount
      vendorTotals[vendor].count++
      vendorTotals[vendor].categories[accountName] = (vendorTotals[vendor].categories[accountName] || 0) + amount
      if (date < vendorTotals[vendor].firstDate) vendorTotals[vendor].firstDate = date
      if (date > vendorTotals[vendor].lastDate) vendorTotals[vendor].lastDate = date
    }
  }
  
  // Sort by total spend descending
  const sorted = Object.entries(vendorTotals)
    .sort(([,a], [,b]) => b.total - a.total)
  
  console.log(`\n=== QB EXPENSE VENDORS (last 6 months) ===`)
  console.log(`Total purchases: ${allPurchases.length}, Bills: ${allBills.length}`)
  console.log(`Unique vendors: ${sorted.length}\n`)
  
  console.log(JSON.stringify(sorted.map(([vendor, data]) => ({
    vendor,
    total: Math.round(data.total * 100) / 100,
    count: data.count,
    categories: Object.fromEntries(Object.entries(data.categories).map(([k,v]) => [k, Math.round(v * 100) / 100])),
    firstDate: data.firstDate,
    lastDate: data.lastDate
  })), null, 2))
}

main().catch(e => { console.error(e); process.exit(1) })
