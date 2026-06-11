import type { Context } from '@netlify/functions'

export default async (request: Request, _context: Context) => {
  // Ultra-minimal debug - just echo back method and version
  return new Response(JSON.stringify({
    method: request.method,
    version: 'v4-bare',
    timestamp: new Date().toISOString(),
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
