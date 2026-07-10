import { useState, useEffect, useRef } from 'react'
import { Camera, Upload, Trash2, FileText, Download, X, Loader2, ScanLine } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { toast } from './Toast'
import { compressImage } from '../lib/imageCompression'

interface Attachment {
  id: string
  job_id: string
  file_name: string
  file_path: string
  file_type: string
  file_size: number
  uploaded_by: string | null
  created_at: string
}

interface ScanImport {
  id: string
  vin: string | null
  file_name: string
  file_path: string
  file_type: string | null
  file_size: number | null
  scan_type: string | null
  scan_tool: string | null
  scan_date: string | null
  job_id: string | null
  created_at: string
}

function timeAgo(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diff = Math.max(0, now - then)
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString()
}

export default function JobAttachments({ jobId, vehicleVins = [] }: { jobId: string; vehicleVins?: string[] }) {
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadStatus, setUploadStatus] = useState('')
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Attachment | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({})
  const photoInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [showScanLibrary, setShowScanLibrary] = useState(false)
  const [scans, setScans] = useState<ScanImport[]>([])
  const [scansLoading, setScansLoading] = useState(false)
  const [attachingId, setAttachingId] = useState<string | null>(null)

  useEffect(() => { loadAttachments() }, [jobId])

  async function loadAttachments() {
    setLoading(true)
    const { data, error } = await supabase
      .from('job_attachments')
      .select('*')
      .eq('job_id', jobId)
      .order('created_at', { ascending: false })
    if (error) { console.error('loadAttachments error', error) }
    const items = (data || []) as Attachment[]
    setAttachments(items)

    // Get signed URLs for images
    const urls: Record<string, string> = {}
    await Promise.all(items.map(async (a) => {
      if (a.file_type.startsWith('image/')) {
        const { data: urlData } = await supabase.storage
          .from('job-attachments')
          .createSignedUrl(a.file_path, 3600)
        if (urlData?.signedUrl) urls[a.id] = urlData.signedUrl
      }
    }))
    setSignedUrls(urls)
    setLoading(false)
  }

  async function handleMultiUpload(files: FileList) {
    const fileArray = Array.from(files)
    if (fileArray.length === 0) return
    setUploading(true)
    let succeeded = 0
    for (let i = 0; i < fileArray.length; i++) {
      const rawFile = fileArray[i]
      setUploadStatus(fileArray.length > 1 ? `Uploading ${i + 1} of ${fileArray.length}...` : 'Uploading...')
      setUploadProgress(10)

      // Compress images before upload (resize + trim black borders + JPEG 85%)
      const file = await compressImage(rawFile)

      const uuid = crypto.randomUUID()
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const storagePath = `${jobId}/${uuid}_${safeName}`

      try {
        setUploadProgress(30)
        const { error: uploadError } = await supabase.storage
          .from('job-attachments')
          .upload(storagePath, file, { contentType: file.type })
        if (uploadError) throw uploadError
        setUploadProgress(70)

        const { error: dbError } = await supabase
          .from('job_attachments')
          .insert({
            job_id: jobId,
            file_name: file.name,
            file_path: storagePath,
            file_type: file.type,
            file_size: file.size,
            uploaded_by: null,
          })
        if (dbError) throw dbError
        setUploadProgress(100)
        succeeded++
      } catch (err: any) {
        console.error('Upload error:', err)
        toast(`Failed to upload ${file.name}: ${err.message || 'Unknown error'}`)
      }
    }
    if (succeeded > 0) {
      toast(succeeded === 1 ? 'File uploaded ✓' : `${succeeded} files uploaded ✓`)
      await loadAttachments()
    }
    setUploading(false)
    setUploadProgress(0)
    setUploadStatus('')
  }

  function onFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (files && files.length > 0) handleMultiUpload(files)
    e.target.value = ''
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await supabase.storage.from('job-attachments').remove([deleteTarget.file_path])
      await supabase.from('job_attachments').delete().eq('id', deleteTarget.id)
      toast('Attachment deleted ✓')
      setAttachments(attachments.filter(a => a.id !== deleteTarget.id))
    } catch (err: any) {
      console.error('Delete error:', err)
      toast(`Delete failed: ${err.message || 'Unknown error'}`)
    }
    setDeleting(false)
    setDeleteTarget(null)
  }

  async function handleDownload(attachment: Attachment) {
    try {
      const { data, error } = await supabase.storage
        .from('job-attachments')
        .download(attachment.file_path)
      if (error) throw error
      const url = URL.createObjectURL(data)
      const a = document.createElement('a')
      a.href = url
      a.download = attachment.file_name
      a.click()
      URL.revokeObjectURL(url)
    } catch (err: any) {
      toast(`Download failed: ${err.message || 'Unknown error'}`)
    }
  }

  async function openLightbox(attachment: Attachment) {
    if (signedUrls[attachment.id]) {
      setLightboxUrl(signedUrls[attachment.id])
    } else {
      const { data } = await supabase.storage
        .from('job-attachments')
        .createSignedUrl(attachment.file_path, 3600)
      if (data?.signedUrl) setLightboxUrl(data.signedUrl)
    }
  }

  function formatFileSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  async function loadScans() {
    setScansLoading(true)
    // Trigger Gmail import to pick up any new scans
    try {
      await fetch('/api/gmail/scan-import', { method: 'POST' })
    } catch (err) {
      console.warn('Gmail scan check failed (non-blocking):', err)
    }
    const { data, error } = await supabase
      .from('scan_imports')
      .select('*')
      .is('job_id', null)
      .order('created_at', { ascending: false })
      .limit(50)
    if (error) console.error('loadScans error', error)
    setScans((data || []) as ScanImport[])
    setScansLoading(false)
  }

  function openScanLibrary() {
    setShowScanLibrary(true)
    loadScans()
  }

  async function attachScan(scan: ScanImport) {
    setAttachingId(scan.id)
    try {
      const res = await fetch('/api/attach-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scan_id: scan.id, job_id: jobId }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Attach failed')

      toast('Scan attached ✓')
      setScans(scans.filter(s => s.id !== scan.id))
      await loadAttachments()
    } catch (err: any) {
      console.error('Attach scan error:', err)
      toast(`Attach failed: ${err.message || 'Unknown error'}`)
    }
    setAttachingId(null)
  }

  const vinSet = new Set(vehicleVins.map(v => v.toUpperCase()))
  const matchingScans = scans.filter(s => s.vin && vinSet.has(s.vin.toUpperCase()))
  const otherScans = scans.filter(s => !s.vin || !vinSet.has(s.vin.toUpperCase()))

  const images = attachments.filter(a => a.file_type.startsWith('image/'))
  const files = attachments.filter(a => !a.file_type.startsWith('image/'))

  return (
    <div className="bg-[var(--color-surface)] rounded-lg p-4">
      <h3 className="text-sm font-medium text-[var(--color-muted)] mb-3">Attachments</h3>

      {/* Upload buttons */}
      <div className="flex gap-2 mb-3">
        <input ref={photoInputRef} type="file" accept="image/*" capture="environment"
          className="hidden" onChange={onFileSelect} />
        <input ref={fileInputRef} type="file" multiple
          accept="image/jpeg,image/png,image/heic,image/heif,image/webp,application/pdf"
          className="hidden" onChange={onFileSelect} />
        <button onClick={() => photoInputRef.current?.click()} disabled={uploading}
          className="flex-1 flex items-center justify-center gap-2 bg-[var(--color-bg)] border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-[var(--color-muted)] hover:text-white hover:border-[var(--color-primary)] transition min-h-[44px] disabled:opacity-50">
          <Camera size={16} />Take Photo
        </button>
        <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
          className="flex-1 flex items-center justify-center gap-2 bg-[var(--color-bg)] border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-[var(--color-muted)] hover:text-white hover:border-[var(--color-primary)] transition min-h-[44px] disabled:opacity-50">
          <Upload size={16} />Upload File
        </button>
        <button onClick={openScanLibrary} disabled={uploading}
          className="flex-1 flex items-center justify-center gap-2 bg-[var(--color-bg)] border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-[var(--color-muted)] hover:text-white hover:border-[var(--color-primary)] transition min-h-[44px] disabled:opacity-50">
          <ScanLine size={16} />Scan Library
        </button>
      </div>

      {/* Scan Library Panel */}
      {showScanLibrary && (
        <div className="mb-3 bg-[var(--color-bg)] border border-gray-700 rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700">
            <span className="text-sm font-medium text-white">Scan Library</span>
            <button onClick={() => setShowScanLibrary(false)}
              className="text-[var(--color-muted)] hover:text-white p-1 min-h-[44px] min-w-[44px] flex items-center justify-center">
              <X size={16} />
            </button>
          </div>
          {scansLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 size={18} className="animate-spin text-[var(--color-muted)]" />
            </div>
          ) : scans.length === 0 ? (
            <p className="text-xs text-[var(--color-muted)] text-center py-6">No scans available</p>
          ) : (
            <div className="max-h-[320px] overflow-y-auto">
              {matchingScans.length > 0 && (
                <>
                  <div className="px-3 py-1.5 bg-[var(--color-surface)]">
                    <span className="text-[10px] font-semibold text-[var(--color-primary)] uppercase tracking-wider">Matching VIN</span>
                  </div>
                  {matchingScans.map(scan => (
                    <div key={scan.id} className="flex items-center gap-3 px-3 py-2.5 border-b border-gray-700/50">
                      <ScanLine size={14} className="text-[var(--color-muted)] flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white truncate">{scan.file_name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {scan.scan_tool && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-surface)] text-[var(--color-muted)] font-medium uppercase">
                              {scan.scan_tool === 'topdon' ? 'TopDon' : scan.scan_tool === 'autel' ? 'Autel' : scan.scan_tool}
                            </span>
                          )}
                          {scan.vin && <span className="text-[10px] text-[var(--color-muted)]">{scan.vin}</span>}
                          <span className="text-[10px] text-[var(--color-muted)]">{timeAgo(scan.scan_date || scan.created_at)}</span>
                        </div>
                      </div>
                      <button onClick={() => attachScan(scan)} disabled={attachingId === scan.id}
                        className="bg-[var(--color-primary)] text-white text-xs font-medium px-3 py-1.5 rounded-lg hover:brightness-110 transition min-h-[44px] disabled:opacity-50 flex-shrink-0">
                        {attachingId === scan.id ? <Loader2 size={14} className="animate-spin" /> : 'Attach'}
                      </button>
                    </div>
                  ))}
                </>
              )}
              {otherScans.length > 0 && (
                <>
                  <div className="px-3 py-1.5 bg-[var(--color-surface)]">
                    <span className="text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">Recent Scans</span>
                  </div>
                  {otherScans.map(scan => (
                    <div key={scan.id} className="flex items-center gap-3 px-3 py-2.5 border-b border-gray-700/50">
                      <ScanLine size={14} className="text-[var(--color-muted)] flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white truncate">{scan.file_name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {scan.scan_tool && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-surface)] text-[var(--color-muted)] font-medium uppercase">
                              {scan.scan_tool === 'topdon' ? 'TopDon' : scan.scan_tool === 'autel' ? 'Autel' : scan.scan_tool}
                            </span>
                          )}
                          {scan.vin && <span className="text-[10px] text-[var(--color-muted)]">{scan.vin}</span>}
                          <span className="text-[10px] text-[var(--color-muted)]">{timeAgo(scan.scan_date || scan.created_at)}</span>
                        </div>
                      </div>
                      <button onClick={() => attachScan(scan)} disabled={attachingId === scan.id}
                        className="bg-[var(--color-primary)] text-white text-xs font-medium px-3 py-1.5 rounded-lg hover:brightness-110 transition min-h-[44px] disabled:opacity-50 flex-shrink-0">
                        {attachingId === scan.id ? <Loader2 size={14} className="animate-spin" /> : 'Attach'}
                      </button>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Upload progress */}
      {uploading && (
        <div className="mb-3">
          <div className="flex items-center gap-2 mb-1">
            <Loader2 size={14} className="animate-spin text-[var(--color-primary)]" />
            <span className="text-xs text-[var(--color-muted)]">{uploadStatus || 'Uploading...'}</span>
          </div>
          <div className="w-full bg-[var(--color-bg)] rounded-full h-1.5">
            <div className="bg-[var(--color-primary)] h-1.5 rounded-full transition-all duration-300"
              style={{ width: `${uploadProgress}%` }} />
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && <p className="text-xs text-[var(--color-muted)]">Loading attachments...</p>}

      {/* Image thumbnails */}
      {images.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-3">
          {images.map(a => (
            <div key={a.id} className="relative group">
              <button onClick={() => openLightbox(a)}
                className="w-full aspect-square bg-[var(--color-bg)] rounded-lg overflow-hidden">
                {signedUrls[a.id] ? (
                  <img src={signedUrls[a.id]} alt={a.file_name}
                    className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[var(--color-muted)]">
                    <Loader2 size={16} className="animate-spin" />
                  </div>
                )}
              </button>
              <button onClick={(e) => { e.stopPropagation(); setDeleteTarget(a) }}
                className="absolute top-1 right-1 bg-black/60 rounded-full p-1.5 text-gray-300 hover:text-red-400 transition min-h-[32px] min-w-[32px] flex items-center justify-center">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* PDF / other files */}
      {files.length > 0 && (
        <div className="space-y-1.5">
          {files.map(a => (
            <div key={a.id} className="flex items-center gap-3 bg-[var(--color-bg)] rounded-lg px-3 py-2.5">
              <FileText size={16} className="text-[var(--color-muted)] flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate">{a.file_name}</p>
                <p className="text-[10px] text-[var(--color-muted)]">{formatFileSize(a.file_size)}</p>
              </div>
              <button onClick={() => handleDownload(a)}
                className="text-[var(--color-muted)] hover:text-[var(--color-primary)] p-2 min-h-[44px] min-w-[44px] flex items-center justify-center">
                <Download size={16} />
              </button>
              <button onClick={() => setDeleteTarget(a)}
                className="text-gray-600 hover:text-red-400 p-2 min-h-[44px] min-w-[44px] flex items-center justify-center">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && attachments.length === 0 && (
        <p className="text-xs text-[var(--color-muted)] text-center py-2">No attachments yet. Take a photo or upload a file.</p>
      )}

      {/* Lightbox */}
      {lightboxUrl && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
          onClick={() => setLightboxUrl(null)}>
          <button className="absolute top-4 right-4 text-white/70 hover:text-white p-2 min-h-[44px] min-w-[44px] flex items-center justify-center"
            onClick={() => setLightboxUrl(null)}>
            <X size={24} />
          </button>
          <img src={lightboxUrl} alt="Attachment"
            className="max-w-full max-h-[90vh] object-contain rounded-lg"
            onClick={e => e.stopPropagation()} />
        </div>
      )}

      {/* Delete confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
          onClick={() => setDeleteTarget(null)}>
          <div className="bg-[var(--color-surface)] rounded-lg p-6 max-w-sm w-full"
            onClick={e => e.stopPropagation()}>
            <h3 className="text-white font-medium mb-2">Delete Attachment?</h3>
            <p className="text-[var(--color-muted)] text-sm mb-4">
              Are you sure you want to delete <span className="text-white">{deleteTarget.file_name}</span>?
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 rounded-lg text-sm text-[var(--color-muted)] hover:text-white transition min-h-[44px]">
                Cancel
              </button>
              <button onClick={handleDelete} disabled={deleting}
                className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-500 disabled:opacity-50 transition min-h-[44px]">
                {deleting ? 'Deleting...' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
