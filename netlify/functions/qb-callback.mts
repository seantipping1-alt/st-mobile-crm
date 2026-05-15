import type { Context } from '@netlify/functions'

export default async (request: Request, context: Context) => {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const realmId = url.searchParams.get('realmId')
  const state = url.searchParams.get('state')

  if (!code || !realmId) {
    return new Response(JSON.stringify({ error: 'Missing code or realmId' }), {
      status: 400,
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

  const redirectUri = 'https://celebrated-cobbler-d9f2a0.netlify.app/auth/callback'

  // Exchange code for tokens
  const basicAuth = btoa(`${clientId}:${clientSecret}`)

  const tokenResponse = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }),
  })

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text()
    console.error('Token exchange failed:', errorText)
    return new Response(JSON.stringify({ error: 'Token exchange failed', details: errorText }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const tokens = await tokenResponse.json()

  // Calculate expiry times
  const now = new Date()
  const expiresAt = new Date(now.getTime() + tokens.expires_in * 1000).toISOString()
  const refreshTokenExpiresAt = tokens.x_refresh_token_expires_in
    ? new Date(now.getTime() + tokens.x_refresh_token_expires_in * 1000).toISOString()
    : null

  // Store tokens in Supabase - upsert by realm_id
  // First, delete any existing tokens for this realm
  await fetch(`${supabaseUrl}/rest/v1/qb_tokens?realm_id=eq.${realmId}`, {
    method: 'DELETE',
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
    },
  })

  // Insert new tokens
  const insertResponse = await fetch(`${supabaseUrl}/rest/v1/qb_tokens`, {
    method: 'POST',
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify({
      realm_id: realmId,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_type: tokens.token_type || 'bearer',
      expires_at: expiresAt,
      refresh_token_expires_at: refreshTokenExpiresAt,
    }),
  })

  if (!insertResponse.ok) {
    const errorText = await insertResponse.text()
    console.error('Failed to store tokens:', errorText)
    return new Response(JSON.stringify({ error: 'Failed to store tokens', details: errorText }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return new Response(null, {
    status: 302,
    headers: { Location: '/settings?qb=connected' },
  })
}
