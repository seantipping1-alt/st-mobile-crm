import type { Context } from '@netlify/functions'

export default async (request: Request, _context: Context) => {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({ step: 'post-handler-reached' }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  })
}
