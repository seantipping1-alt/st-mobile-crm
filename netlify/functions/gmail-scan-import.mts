import type { Context } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'

// Invoked on-demand via POST /api/gmail/scan-import (Scan Library button)

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me'

// --- Scan tool sender configs (easy to add new ones) ---
interface ScanToolConfig {
  name: string
  searchQuery: string
  detectScanType: (subject: string, filename: string) => string | null
}

const SCAN_TOOL_CONFIGS: ScanToolConfig[] = [
  {
    name: 'topdon',
    searchQuery: 'from:topdondiagnostics.com OR from:topdoninfo.com',
    detectScanType: (subject: string, filename: string) => {
      const lower = (subject + ' ' + filename).toLowerCase()
      if (lower.includes('full') || lower.includes('all system')) return 'full_scan'
      if (lower.includes('dtc') || lower.includes('diagnostic')) return 'dtc_report'
      if (lower.includes('maintenance') || lower.includes('service')) return 'maintenance_report'
      return 'scan_report'
    },
  },
  {
    name: 'autel',
    searchQuery: 'from:autel.com',
    detectScanType: (subject: string, filename: string) => {
      const lower = (subject + ' ' + filename).toLowerCase()
      if (lower.includes('full') || lower.includes('all system')) return 'full_scan'
      if (lower.includes('dtc')) return 'dtc_report'
      return 'scan_report'
    },
  },
]

// VIN regex: 17 alphanumeric chars excluding I, O, Q
const VIN_REGEX = /\b[A-HJ-NPR-Z0-9]{17}\b/i

function extractVin(text: string): string | null {
  const match = text.match(VIN_REGEX)
  if (!match) return null
  const vin = match[0].toUpperCase()
  // Extra validation: VINs don't start with 0
  if (vin.startsWith('0')) return null
  return vin
}

function extractSenderEmail(fromHeader: string): string {
  const match = fromHeader.match(/<([^>]+)>/)
  return match ? match[1].toLowerCase() : fromHeader.toLowerCase().trim()
}

// Extract hosted PDF links from email body (TopDon uses diagreport.com and topdoninfo.com)
function extractHostedPdfLinks(htmlBody: string): string[] {
  const urls: string[] = []
  // Match diagreport.com PDF links
  const diagRegex = /https?:\/\/file\.diagreport\.com\/[^\s"'<>]+\.pdf/gi
  let match: RegExpExecArray | null
  while ((match = diagRegex.exec(htmlBody)) !== null) {
    urls.push(match[0])
  }
  // Match topdoninfo.com report links (VIEW REPORT button)
  const topdonRegex = /https?:\/\/[^\s"'<>]*topdoninfo\.com\/[^\s"'<>]+/gi
  while ((match = topdonRegex.exec(htmlBody)) !== null) {
    // Only include if it looks like a report link (not unsubscribe etc)
    const url = match[0]
    if (!url.includes('unsubscribe') && !url.includes('opt-out')) {
      urls.push(url)
    }
  }
  // Match any direct PDF links we might have missed
  const pdfRegex = /https?:\/\/[^\s"'<>]+\.pdf(?:\?[^\s"'<>]*)?/gi
  while ((match = pdfRegex.exec(htmlBody)) !== null) {
    if (!urls.includes(match[0])) {
      urls.push(match[0])
    }
  }
  return urls
}

async function getAccessToken(clientId: string, clientSecret: string, refreshToken: string): Promise<string> {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Token refresh failed: ${err}`)
  }

  const data = await response.json()
  return data.access_token
}

async function searchMessages(accessToken: string, query: string): Promise<any[]> {
  const url = new URL(`${GMAIL_API}/messages`)
  url.searchParams.set('q', query)
  url.searchParams.set('maxResults', '100')

  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Gmail search failed: ${err}`)
  }

  const data = await response.json()
  return data.messages || []
}

async function getMessage(accessToken: string, messageId: string): Promise<any> {
  const url = `${GMAIL_API}/messages/${messageId}?format=full`
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Gmail get message failed: ${err}`)
  }

  return response.json()
}

async function getAttachment(accessToken: string, messageId: string, attachmentId: string): Promise<Buffer> {
  const url = `${GMAIL_API}/messages/${messageId}/attachments/${attachmentId}`
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Gmail get attachment failed: ${err}`)
  }

  const data = await response.json()
  // Gmail returns base64url-encoded data
  const base64 = data.data.replace(/-/g, '+').replace(/_/g, '/')
  return Buffer.from(base64, 'base64')
}

async function downloadPdfFromUrl(url: string): Promise<{ data: Buffer; filename: string }> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to download PDF from ${url}: ${response.status}`)
  }
  const arrayBuffer = await response.arrayBuffer()
  const data = Buffer.from(arrayBuffer)

  // Extract filename from URL or Content-Disposition
  const disposition = response.headers.get('content-disposition')
  let filename = 'scan-report.pdf'
  if (disposition) {
    const match = disposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/)
    if (match) filename = match[1].replace(/['"]/g, '')
  } else {
    const urlPath = new URL(url).pathname
    const pathFilename = urlPath.split('/').pop()
    if (pathFilename && pathFilename.endsWith('.pdf')) {
      filename = decodeURIComponent(pathFilename)
    }
  }

  return { data, filename }
}

function getHeader(headers: any[], name: string): string {
  const header = headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())
  return header?.value || ''
}

function getEmailBody(payload: any): string {
  // Try to get HTML body, fall back to plain text
  if (payload.body?.data) {
    const base64 = payload.body.data.replace(/-/g, '+').replace(/_/g, '/')
    return Buffer.from(base64, 'base64').toString('utf-8')
  }

  if (payload.parts) {
    // Look for text/html first, then text/plain
    for (const mimeType of ['text/html', 'text/plain']) {
      for (const part of payload.parts) {
        if (part.mimeType === mimeType && part.body?.data) {
          const base64 = part.body.data.replace(/-/g, '+').replace(/_/g, '/')
          return Buffer.from(base64, 'base64').toString('utf-8')
        }
        // Check nested parts (multipart/alternative inside multipart/mixed)
        if (part.parts) {
          for (const subpart of part.parts) {
            if (subpart.mimeType === mimeType && subpart.body?.data) {
              const base64 = subpart.body.data.replace(/-/g, '+').replace(/_/g, '/')
              return Buffer.from(base64, 'base64').toString('utf-8')
            }
          }
        }
      }
    }
  }

  return ''
}

function getPdfAttachments(payload: any): Array<{ filename: string; attachmentId: string; size: number }> {
  const attachments: Array<{ filename: string; attachmentId: string; size: number }> = []

  function walkParts(parts: any[]) {
    for (const part of parts) {
      if (
        part.filename &&
        part.filename.toLowerCase().endsWith('.pdf') &&
        part.body?.attachmentId
      ) {
        attachments.push({
          filename: part.filename,
          attachmentId: part.body.attachmentId,
          size: part.body.size || 0,
        })
      }
      if (part.parts) {
        walkParts(part.parts)
      }
    }
  }

  if (payload.parts) {
    walkParts(payload.parts)
  }

  return attachments
}

export default async (_request: Request, _context: Context) => {
  const clientId = Netlify.env.get('GMAIL_CLIENT_ID')
  const clientSecret = Netlify.env.get('GMAIL_CLIENT_SECRET')
  const refreshToken = Netlify.env.get('GMAIL_REFRESH_TOKEN')
  const supabaseUrl = Netlify.env.get('SUPABASE_URL')
  const supabaseServiceKey = Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!clientId || !clientSecret || !refreshToken) {
    console.error('Missing Gmail environment variables')
    return new Response(JSON.stringify({ error: 'Missing Gmail environment variables' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase environment variables')
    return new Response(JSON.stringify({ error: 'Missing Supabase environment variables' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  try {
    const accessToken = await getAccessToken(clientId, clientSecret, refreshToken)
    console.log('Gmail access token obtained successfully')

    // Get all already-imported Gmail message IDs to skip them fast
    const { data: importedMessages } = await supabase
      .from('scan_imports')
      .select('gmail_message_id')
      .not('gmail_message_id', 'is', null)
      .limit(1000)
    const importedMsgIds = new Set((importedMessages || []).map((r: any) => r.gmail_message_id))

    // Also get existing dedup keys (for older imports without gmail_message_id)
    const { data: existingScans } = await supabase
      .from('scan_imports')
      .select('source_email, email_subject, file_name')
      .limit(2000)
    const existingKeys = new Set(
      (existingScans || []).map((s: any) => `${s.source_email}|${s.email_subject}|${s.file_name}`)
    )

    let totalProcessed = 0
    let totalSkipped = 0
    let totalErrors = 0
    const results: Array<{ vin: string | null; file_name: string; scan_tool: string; status: string }> = []

    // Process each scan tool config
    for (const toolConfig of SCAN_TOOL_CONFIGS) {
      // Search 30 days back to catch older scans
      const query = `${toolConfig.searchQuery} newer_than:7d`
      console.log(`Searching Gmail: ${query}`)

      let messages: any[]
      try {
        messages = await searchMessages(accessToken, query)
      } catch (err: any) {
        console.error(`Search failed for ${toolConfig.name}: ${err.message}`)
        totalErrors++
        continue
      }

      console.log(`Found ${messages.length} messages for ${toolConfig.name}`)

      for (const msg of messages) {
        // Fast skip: if we already processed this Gmail message ID
        if (importedMsgIds.has(msg.id)) {
          totalSkipped++
          continue
        }

        try {
          const message = await getMessage(accessToken, msg.id)
          const headers = message.payload?.headers || []
          const subject = getHeader(headers, 'Subject')
          const from = getHeader(headers, 'From')
          const date = getHeader(headers, 'Date')
          const senderEmail = extractSenderEmail(from)
          const vin = extractVin(subject)
          const scanDate = date ? new Date(date).toISOString() : null

          console.log(`Processing: "${subject}" from ${senderEmail}`)

          // Collect all PDFs to process: attachments + hosted links
          const pdfItems: Array<{
            type: 'attachment' | 'hosted'
            filename: string
            attachmentId?: string
            url?: string
            size?: number
          }> = []

          // Get PDF attachments
          const attachments = getPdfAttachments(message.payload)
          for (const att of attachments) {
            pdfItems.push({
              type: 'attachment',
              filename: att.filename,
              attachmentId: att.attachmentId,
              size: att.size,
            })
          }

          // Check email body for hosted PDF links (TopDon diagreport.com)
          if (toolConfig.name === 'topdon') {
            const body = getEmailBody(message.payload)
            const hostedLinks = extractHostedPdfLinks(body)
            for (const link of hostedLinks) {
              const urlFilename = decodeURIComponent(new URL(link).pathname.split('/').pop() || 'scan-report.pdf')
              // Avoid duplicating if attachment with same name exists
              if (!pdfItems.some(p => p.filename === urlFilename)) {
                pdfItems.push({
                  type: 'hosted',
                  filename: urlFilename,
                  url: link,
                })
              }
            }
          }

          if (pdfItems.length === 0) {
            console.log(`  No PDFs found in message, skipping`)
            // Still mark message as processed so we skip it next time
            importedMsgIds.add(msg.id)
            continue
          }

          let anyImported = false

          for (const pdf of pdfItems) {
            try {
              // Deduplication check via composite key
              const dedupKey = `${senderEmail}|${subject}|${pdf.filename}`
              if (existingKeys.has(dedupKey)) {
                console.log(`  Skipping duplicate: ${pdf.filename}`)
                totalSkipped++
                results.push({ vin, file_name: pdf.filename, scan_tool: toolConfig.name, status: 'skipped_duplicate' })
                continue
              }

              // Download the PDF
              let pdfData: Buffer
              let fileSize: number

              if (pdf.type === 'attachment' && pdf.attachmentId) {
                pdfData = await getAttachment(accessToken, msg.id, pdf.attachmentId)
                fileSize = pdfData.length
              } else if (pdf.type === 'hosted' && pdf.url) {
                const downloaded = await downloadPdfFromUrl(pdf.url)
                pdfData = downloaded.data
                fileSize = pdfData.length
                // Update filename if we got a better one from the download
                if (pdf.filename === 'scan-report.pdf' && downloaded.filename !== 'scan-report.pdf') {
                  pdf.filename = downloaded.filename
                }
              } else {
                console.log(`  Skipping invalid PDF item: ${pdf.filename}`)
                continue
              }

              // Build storage path: scan-imports/{date}/{vin_or_unknown}/{filename}
              const datePrefix = scanDate ? new Date(scanDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]
              const vinPrefix = vin || 'unknown-vin'
              const storagePath = `${datePrefix}/${vinPrefix}/${pdf.filename}`

              // Upload to Supabase Storage
              const { error: uploadError } = await supabase.storage
                .from('scan-imports')
                .upload(storagePath, pdfData, {
                  contentType: 'application/pdf',
                  upsert: false,
                })

              if (uploadError) {
                // If file already exists in storage, that's ok — continue with insert
                if (!uploadError.message?.includes('already exists') && !uploadError.message?.includes('Duplicate')) {
                  throw new Error(`Storage upload failed: ${uploadError.message}`)
                }
                console.log(`  File already in storage, continuing with DB insert`)
              }

              // Detect scan type
              const scanType = toolConfig.detectScanType(subject, pdf.filename)

              // Insert into scan_imports with gmail_message_id for fast dedup
              const { error: insertError } = await supabase
                .from('scan_imports')
                .insert({
                  vin,
                  source_email: senderEmail,
                  email_subject: subject,
                  file_name: pdf.filename,
                  file_path: storagePath,
                  file_type: 'application/pdf',
                  file_size: fileSize,
                  scan_type: scanType,
                  scan_tool: toolConfig.name,
                  scan_date: scanDate,
                  gmail_message_id: msg.id,
                  job_id: null,
                  linked_at: null,
                })

              if (insertError) {
                throw new Error(`DB insert failed: ${insertError.message}`)
              }

              // Add to dedup sets so we don't re-process within this run
              existingKeys.add(`${senderEmail}|${subject}|${pdf.filename}`)
              anyImported = true

              console.log(`  Imported: ${pdf.filename} (VIN: ${vin || 'none'})`)
              totalProcessed++
              results.push({ vin, file_name: pdf.filename, scan_tool: toolConfig.name, status: 'imported' })
            } catch (pdfErr: any) {
              console.error(`  Error processing PDF ${pdf.filename}: ${pdfErr.message}`)
              totalErrors++
              results.push({ vin, file_name: pdf.filename, scan_tool: toolConfig.name, status: `error: ${pdfErr.message}` })
            }
          }

          // Mark this message as processed
          importedMsgIds.add(msg.id)
        } catch (msgErr: any) {
          console.error(`Error processing message ${msg.id}: ${msgErr.message}`)
          totalErrors++
        }
      }
    }

    const summary = {
      success: true,
      processed: totalProcessed,
      skipped: totalSkipped,
      errors: totalErrors,
      results,
      timestamp: new Date().toISOString(),
    }

    console.log(`Gmail scan import complete: ${totalProcessed} imported, ${totalSkipped} skipped, ${totalErrors} errors`)

    return new Response(JSON.stringify(summary), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      },
    })
  } catch (error: any) {
    console.error('Gmail scan import error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
