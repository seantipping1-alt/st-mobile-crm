import type { Context } from '@netlify/functions'

export default async (request: Request, context: Context) => {
  const clientId = Netlify.env.get('QB_CLIENT_ID')
  if (!clientId) {
    return new Response(JSON.stringify({ error: 'QB_CLIENT_ID not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Generate random state for CSRF protection
  const state = crypto.randomUUID()

  const redirectUri = 'https://app.stmobileauto.com/auth/callback'

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'com.intuit.quickbooks.accounting',
    state,
  })

  const authorizeUrl = `https://appcenter.intuit.com/connect/oauth2?${params.toString()}`

  return new Response(null, {
    status: 302,
    headers: { Location: authorizeUrl },
  })
}
