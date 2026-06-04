import type { Context } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'

export default async (request: Request, _context: Context) => {
  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const supabaseUrl = Netlify.env.get('SUPABASE_URL')
  const supabaseKey = Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !supabaseKey) {
    return new Response(JSON.stringify({ error: 'Missing environment variables' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const url = new URL(request.url)
  const jobId = url.searchParams.get('id')

  if (!jobId) {
    return new Response(JSON.stringify({ error: 'Missing job id' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(supabaseUrl, supabaseKey)

  try {
    // Fetch job
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select('id, scheduled_start')
      .eq('id', jobId)
      .single()

    if (jobError || !job) {
      return new Response(JSON.stringify({ error: 'Job not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Fetch vehicles
    const { data: jobVehicles } = await supabase
      .from('job_vehicles')
      .select('*, vehicles(year, make, model, vin)')
      .eq('job_id', jobId)
      .order('sort_order')

    // Fetch line items (no pricing)
    const { data: lineItems } = await supabase
      .from('job_line_items')
      .select('description, notes')
      .eq('job_id', jobId)
      .order('sort_order')

    // Fetch attachments
    const { data: attachments } = await supabase
      .from('job_attachments')
      .select('*')
      .eq('job_id', jobId)
      .order('created_at', { ascending: false })

    // Generate signed URLs for attachments
    const attachmentsWithUrls = await Promise.all(
      (attachments || []).map(async (att: any) => {
        const { data: signedData } = await supabase.storage
          .from('job-attachments')
          .createSignedUrl(att.file_path, 3600)

        return {
          id: att.id,
          file_name: att.file_name,
          file_type: att.file_type,
          file_path: att.file_path,
          signed_url: signedData?.signedUrl || null,
        }
      })
    )

    // Extract vehicles from join
    const vehicles = (jobVehicles || []).map((jv: any) => ({
      year: jv.vehicles?.year,
      make: jv.vehicles?.make,
      model: jv.vehicles?.model,
      vin: jv.vehicles?.vin,
    }))

    return new Response(JSON.stringify({
      id: job.id,
      scheduled_start: job.scheduled_start,
      vehicles,
      line_items: lineItems || [],
      attachments: attachmentsWithUrls,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'Internal error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
