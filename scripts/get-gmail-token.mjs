/**
 * One-time script to get a Gmail refresh token via OAuth.
 * Run: node scripts/get-gmail-token.mjs
 * Opens browser, you sign in with info@stmobileauto.com, and it captures the refresh token.
 */
import http from 'node:http'
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const creds = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', '.gmail-credentials.json'), 'utf8'))
const CLIENT_ID = creds.web.client_id
const CLIENT_SECRET = creds.web.client_secret
const REDIRECT_URI = 'http://localhost:3456/callback'
const SCOPES = 'https://www.googleapis.com/auth/gmail.readonly'

// Build the auth URL
const authUrl = new URL('https://accounts.google.com/o/oauth2/auth')
authUrl.searchParams.set('client_id', CLIENT_ID)
authUrl.searchParams.set('redirect_uri', REDIRECT_URI)
authUrl.searchParams.set('response_type', 'code')
authUrl.searchParams.set('scope', SCOPES)
authUrl.searchParams.set('access_type', 'offline')
authUrl.searchParams.set('prompt', 'consent')

// Start a temporary server to capture the callback
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost:3456')
  
  if (url.pathname !== '/callback') {
    res.writeHead(404)
    res.end('Not found')
    return
  }

  const code = url.searchParams.get('code')
  if (!code) {
    res.writeHead(400)
    res.end('No code received')
    return
  }

  try {
    // Exchange code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: REDIRECT_URI,
      }),
    })

    const tokenData = await tokenResponse.json()

    if (tokenData.error) {
      console.error('\n❌ Error:', tokenData.error_description || tokenData.error)
      res.writeHead(500)
      res.end('Token exchange failed: ' + tokenData.error)
    } else {
      console.log('\n✅ Success! Here are your tokens:\n')
      console.log('GMAIL_REFRESH_TOKEN=' + tokenData.refresh_token)
      console.log('\nAccess token (temporary):', tokenData.access_token?.substring(0, 30) + '...')
      console.log('Expires in:', tokenData.expires_in, 'seconds')
      
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end('<h1>✅ Done!</h1><p>Refresh token captured. You can close this tab.</p>')
    }
  } catch (err) {
    console.error('\n❌ Error exchanging code:', err.message)
    res.writeHead(500)
    res.end('Error: ' + err.message)
  }

  // Shut down after handling
  setTimeout(() => {
    server.close()
    process.exit(0)
  }, 1000)
})

server.listen(3456, () => {
  console.log('Opening browser for Gmail authorization...')
  console.log('Sign in with: info@stmobileauto.com\n')
  
  // Open browser on macOS
  try {
    execSync(`open "${authUrl.toString()}"`)
  } catch {
    console.log('Open this URL manually:\n' + authUrl.toString())
  }
})
