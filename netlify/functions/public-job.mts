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
      .select('id, scheduled_start, customer_id, payment_status, qb_invoice_link, invoice_number, qb_invoice_total')
      .eq('id', jobId)
      .single()

    if (jobError || !job) {
      return new Response(JSON.stringify({ error: 'Job not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Fetch customer name and portal token
    let portalToken: string | null = null
    let customerName: string | null = null
    if (job.customer_id) {
      const { data: cust } = await supabase
        .from('customers')
        .select('name, portal_token, customer_type')
        .eq('id', job.customer_id)
        .single()
      customerName = cust?.name || null
      // Only provide portal link for shop customers — individual customers share one record
      if (cust?.customer_type !== 'individual') {
        portalToken = cust?.portal_token || null
      }
    }

    // Fetch vehicles
    const { data: jobVehicles } = await supabase
      .from('job_vehicles')
      .select('*, vehicles(year, make, model, vin)')
      .eq('job_id', jobId)
      .order('sort_order')

    // Fetch line items (with pricing for total)
    const { data: lineItems } = await supabase
      .from('job_line_items')
      .select('description, notes, quantity, unit_price, total')
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

    // Calculate job total — prefer QB invoice total (stays in sync with QB edits)
    const lineItemTotal = (lineItems || []).reduce((sum: number, item: any) => sum + (Number(item.total) || 0), 0)
    const jobTotal = job.qb_invoice_total != null ? Number(job.qb_invoice_total) : lineItemTotal

    return new Response(JSON.stringify({
      id: job.id,
      scheduled_start: job.scheduled_start,
      customer_name: customerName,
      vehicles,
      line_items: lineItems || [],
      attachments: attachmentsWithUrls,
      portal_token: portalToken,
      payment_status: job.payment_status || null,
      qb_invoice_link: job.qb_invoice_link || null,
      invoice_number: job.invoice_number || null,
      job_total: jobTotal,
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
