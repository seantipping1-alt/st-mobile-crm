export default async (request: Request) => {
  return new Response(JSON.stringify({ method: request.method, ok: true }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  })
}
