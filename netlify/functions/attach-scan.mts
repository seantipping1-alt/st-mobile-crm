import type { Context } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'

export default async (request: Request, _context: Context) => {
  if (request.method !== 'POST') {
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

  const supabase = createClient(supabaseUrl, supabaseKey)

  try {
    const { scan_id, job_id } = await request.json()
    if (!scan_id || !job_id) {
      return new Response(JSON.stringify({ error: 'Missing scan_id or job_id' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // 1. Get the scan record
    const { data: scan, error: scanError } = await supabase
      .from('scan_imports')
      .select('*')
      .eq('id', scan_id)
      .single()

    if (scanError || !scan) {
      return new Response(JSON.stringify({ error: 'Scan not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // 2. Download the file from scan-imports bucket (service role bypasses RLS)
    const { data: fileData, error: dlError } = await supabase.storage
      .from('scan-imports')
      .download(scan.file_path)

    if (dlError || !fileData) {
      console.error('Download error:', dlError)
      return new Response(JSON.stringify({ error: `Download failed: ${dlError?.message || 'Unknown'}` }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // 3. Upload to job-attachments bucket
    const uuid = crypto.randomUUID()
    const safeName = scan.file_name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const newPath = `${job_id}/${uuid}_${safeName}`

    const { error: uploadError } = await supabase.storage
      .from('job-attachments')
      .upload(newPath, fileData, {
        contentType: scan.file_type || 'application/pdf',
      })

    if (uploadError) {
      console.error('Upload error:', uploadError)
      return new Response(JSON.stringify({ error: `Upload failed: ${uploadError.message}` }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // 4. Insert job_attachments row
    const { error: dbError } = await supabase
      .from('job_attachments')
      .insert({
        job_id: job_id,
        file_name: scan.file_name,
        file_path: newPath,
        file_type: scan.file_type || 'application/pdf',
        file_size: scan.file_size || 0,
        uploaded_by: null,
      })

    if (dbError) {
      console.error('DB insert error:', dbError)
      return new Response(JSON.stringify({ error: `DB insert failed: ${dbError.message}` }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // 5. Link scan to job
    await supabase
      .from('scan_imports')
      .update({ job_id: job_id, linked_at: new Date().toISOString() })
      .eq('id', scan_id)

    return new Response(JSON.stringify({ success: true, file_path: newPath }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })

  } catch (error: any) {
    console.error('Attach scan error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
