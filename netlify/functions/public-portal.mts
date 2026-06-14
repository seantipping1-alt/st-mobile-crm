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
  const token = url.searchParams.get('token')

  if (!token) {
    return new Response(JSON.stringify({ error: 'Missing token' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(supabaseUrl, supabaseKey)

  try {
    // Look up customer by portal token
    const { data: customer, error: custError } = await supabase
      .from('customers')
      .select('id, name, customer_type')
      .eq('portal_token', token)
      .single()

    if (custError || !customer) {
      return new Response(JSON.stringify({ error: 'Portal not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Individual customers share one record — portal would expose all their jobs to each other
    if (customer.customer_type === 'individual') {
      return new Response(JSON.stringify({ error: 'Portal not available for individual customers' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Fetch all completed jobs for this customer, newest first
    const { data: jobs } = await supabase
      .from('jobs')
      .select('id, scheduled_start, completed_at, job_type, status, shop_name, payment_status, qb_invoice_link, invoice_number, qb_invoice_total')
      .eq('customer_id', customer.id)
      .in('status', ['completed', 'invoiced', 'paid'])
      .order('scheduled_start', { ascending: false })

    // For each job, fetch vehicles and line items (no pricing)
    const jobsWithDetails = await Promise.all(
      (jobs || []).map(async (job: any) => {
        const { data: jobVehicles } = await supabase
          .from('job_vehicles')
          .select('*, vehicles(year, make, model, vin)')
          .eq('job_id', job.id)
          .order('sort_order')

        const { data: lineItems } = await supabase
          .from('job_line_items')
          .select('description, notes, quantity, unit_price, total')
          .eq('job_id', job.id)
          .order('sort_order')

        // Count attachments (don't send full list — that's on the job detail page)
        const { count: attachmentCount } = await supabase
          .from('job_attachments')
          .select('id', { count: 'exact', head: true })
          .eq('job_id', job.id)

        const vehicles = (jobVehicles || []).map((jv: any) => ({
          year: jv.vehicles?.year,
          make: jv.vehicles?.make,
          model: jv.vehicles?.model,
          vin: jv.vehicles?.vin,
        }))

        const lineItemTotal = (lineItems || []).reduce((sum: number, item: any) => sum + (Number(item.total) || 0), 0)
        const jobTotal = job.qb_invoice_total != null ? Number(job.qb_invoice_total) : lineItemTotal

        return {
          id: job.id,
          scheduled_start: job.scheduled_start,
          completed_at: job.completed_at,
          job_type: job.job_type,
          status: job.status,
          shop_name: job.shop_name,
          payment_status: job.payment_status || null,
          qb_invoice_link: job.qb_invoice_link || null,
          invoice_number: job.invoice_number || null,
          vehicles,
          line_items: lineItems || [],
          attachment_count: attachmentCount || 0,
          job_total: jobTotal,
        }
      })
    )

    return new Response(JSON.stringify({
      customer: {
        name: customer.name,
        type: customer.customer_type,
      },
      jobs: jobsWithDetails,
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
