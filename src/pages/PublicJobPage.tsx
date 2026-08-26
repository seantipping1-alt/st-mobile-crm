import { useState, useEffect, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Car, FileText, Download, X, ChevronLeft, ChevronRight, Image, LayoutGrid, CreditCard, ExternalLink, Phone, Globe, CalendarPlus, Printer } from 'lucide-react'

interface Vehicle {
  year: string | null
  make: string | null
  model: string | null
  vin: string | null
}

interface LineItem {
  description: string
  notes: string | null
  quantity: number | null
  unit_price: number | null
  total: number | null
}

interface Attachment {
  id: string
  file_name: string
  file_type: string
  file_path: string
  signed_url: string | null
}

interface JobData {
  id: string
  scheduled_start: string | null
  customer_name: string | null
  customer_phone: string | null
  customer_email: string | null
  customer_address: string | null
  vehicles: Vehicle[]
  line_items: LineItem[]
  attachments: Attachment[]
  portal_token: string | null
  payment_status: string | null
  qb_invoice_link: string | null
  invoice_number: string | null
  job_total: number
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
}

export default function PublicJobPage() {
  const { id } = useParams<{ id: string }>()
  const [job, setJob] = useState<JobData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [showInvoice, setShowInvoice] = useState(false)

  useEffect(() => {
    if (!id) return
    fetch(`/api/public-job?id=${id}`)
      .then(res => {
        if (!res.ok) throw new Error('Job not found')
        return res.json()
      })
      .then(data => setJob(data))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [id])

  const images = job?.attachments.filter(a =>
    a.file_type?.startsWith('image/') && a.signed_url
  ) || []

  const pdfs = job?.attachments.filter(a =>
    a.file_type === 'application/pdf' && a.signed_url
  ) || []

  const navigateLightbox = useCallback((dir: number) => {
    if (lightboxIndex === null) return
    const next = lightboxIndex + dir
    if (next >= 0 && next < images.length) setLightboxIndex(next)
  }, [lightboxIndex, images.length])

  useEffect(() => {
    if (lightboxIndex === null) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxIndex(null)
      if (e.key === 'ArrowLeft') navigateLightbox(-1)
      if (e.key === 'ArrowRight') navigateLightbox(1)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [lightboxIndex, navigateLightbox])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0F172A' }}>
        <div className="animate-spin w-8 h-8 border-2 border-t-transparent rounded-full" style={{ borderColor: '#1FA0E5', borderTopColor: 'transparent' }} />
      </div>
    )
  }

  if (error || !job) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: '#0F172A', color: '#F8FAFC' }}>
        <div className="text-center">
          <h1 className="text-xl font-semibold mb-2">Job Not Found</h1>
          <p style={{ color: '#94A3B8' }}>This link may be expired or invalid.</p>
        </div>
      </div>
    )
  }

  const formattedDate = job.scheduled_start
    ? new Date(job.scheduled_start).toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: 'UTC',
      })
    : null

  return (
    <div className="min-h-screen" style={{ background: '#0F172A', color: '#F8FAFC' }}>
      {/* Header */}
      <header className="border-b px-4 py-5" style={{ borderColor: '#334155', background: '#1E293B' }}>
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src="/st-mobile-logo.png" alt="ST Mobile" className="h-12 w-auto" />
              <div>
                <h1 className="text-lg font-bold tracking-tight" style={{ color: '#F8FAFC' }}>
                  ST Mobile Automotive
                </h1>
                <p className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: '#1FA0E5' }}>
                  Diagnostics · Programming · ADAS · Keys
                </p>
              </div>
            </div>
            {job.portal_token && (
              <Link
                to={`/p/${job.portal_token}`}
                className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg transition-colors hover:brightness-110"
                style={{ background: '#0F172A', color: '#1FA0E5' }}
              >
                <LayoutGrid size={14} />
                All Jobs
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        {/* Customer name banner */}
        {job.customer_name && (
          <div className="rounded-xl px-4 py-3" style={{ background: 'linear-gradient(135deg, #1E293B 0%, #0F172A 100%)', borderLeft: '3px solid #1FA0E5' }}>
            <p className="text-xs uppercase tracking-wider font-medium" style={{ color: '#64748B' }}>Prepared for</p>
            <p className="text-lg font-semibold" style={{ color: '#F8FAFC' }}>{job.customer_name}</p>
          </div>
        )}

        {/* Date */}
        {formattedDate && (
          <p className="text-sm" style={{ color: '#94A3B8' }}>
            {formattedDate}
          </p>
        )}

        {/* Payment status + amount */}
        {(() => {
          const isPaid = job.payment_status === 'paid'
          const isPartial = job.payment_status === 'partial'
          const hasInvoice = !!job.qb_invoice_link
          const showAmount = job.job_total > 0

          if (isPaid || isPartial) {
            return (
              <section className="rounded-xl p-4 flex items-center justify-between" style={{ background: '#1E293B' }}>
                <div className="flex items-center gap-2">
                  <CreditCard size={18} style={{ color: isPaid ? '#22C55E' : '#F59E0B' }} />
                  <span className="text-sm font-medium" style={{ color: isPaid ? '#22C55E' : '#F59E0B' }}>
                    {isPaid ? 'Paid' : 'Partial Payment'}
                  </span>
                </div>
                {showAmount && (
                  <span className="text-lg font-bold" style={{ color: isPaid ? '#22C55E' : '#F59E0B' }}>
                    {formatCurrency(job.job_total)}
                  </span>
                )}
              </section>
            )
          }

          if (hasInvoice) {
            return (
              <section className="rounded-xl p-4" style={{ background: '#1E293B' }}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <CreditCard size={18} style={{ color: '#F59E0B' }} />
                      <span className="text-sm font-medium" style={{ color: '#F59E0B' }}>
                        Invoice{job.invoice_number ? ` #${job.invoice_number}` : ''} — Due
                      </span>
                    </div>
                    {showAmount && (
                      <p className="text-2xl font-bold mt-1" style={{ color: '#F8FAFC' }}>
                        {formatCurrency(job.job_total)}
                      </p>
                    )}
                  </div>
                  <a
                    href={job.qb_invoice_link!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-sm font-medium px-4 py-2.5 rounded-lg transition-colors hover:brightness-110"
                    style={{ background: '#1FA0E5', color: '#FFFFFF' }}
                  >
                    <ExternalLink size={14} />
                    Pay Now
                  </a>
                </div>
              </section>
            )
          }

          // No payment status but has amount
          if (showAmount) {
            return (
              <section className="rounded-xl p-4 flex items-center justify-between" style={{ background: '#1E293B' }}>
                <span className="text-sm font-medium" style={{ color: '#94A3B8' }}>Total</span>
                <span className="text-lg font-bold" style={{ color: '#F8FAFC' }}>
                  {formatCurrency(job.job_total)}
                </span>
              </section>
            )
          }

          return null
        })()}

        {/* Vehicles */}
        {job.vehicles.length > 0 && (
          <section className="rounded-xl p-4" style={{ background: '#1E293B' }}>
            <div className="flex items-center gap-2 mb-3">
              <Car size={18} style={{ color: '#1FA0E5' }} />
              <h2 className="font-semibold text-sm uppercase tracking-wider" style={{ color: '#94A3B8' }}>
                Vehicle{job.vehicles.length > 1 ? 's' : ''}
              </h2>
            </div>
            <div className="space-y-3">
              {job.vehicles.map((v, i) => (
                <div key={i}>
                  <p className="font-medium text-base">
                    {[v.year, v.make, v.model].filter(Boolean).join(' ') || 'Unknown Vehicle'}
                  </p>
                  {v.vin && (
                    <p className="text-xs font-mono mt-0.5" style={{ color: '#94A3B8' }}>
                      VIN: {v.vin}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Services */}
        {job.line_items.length > 0 && (
          <section className="rounded-xl p-4" style={{ background: '#1E293B' }}>
            <div className="flex items-center gap-2 mb-3">
              <FileText size={18} style={{ color: '#1FA0E5' }} />
              <h2 className="font-semibold text-sm uppercase tracking-wider" style={{ color: '#94A3B8' }}>
                Services Performed
              </h2>
            </div>
            <ul className="space-y-3">
              {job.line_items.map((item, i) => (
                <li key={i} className="border-l-2 pl-3" style={{ borderColor: '#1FA0E5' }}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium">{item.description}</p>
                    {item.total != null && item.total > 0 && (
                      <span className="text-sm font-medium flex-shrink-0" style={{ color: '#94A3B8' }}>
                        {formatCurrency(item.total)}
                      </span>
                    )}
                  </div>
                  {item.notes && (
                    <p className="text-xs mt-1 whitespace-pre-wrap" style={{ color: '#94A3B8' }}>{item.notes}</p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Images */}
        {images.length > 0 && (
          <section className="rounded-xl p-4" style={{ background: '#1E293B' }}>
            <div className="flex items-center gap-2 mb-3">
              <Image size={18} style={{ color: '#1FA0E5' }} />
              <h2 className="font-semibold text-sm uppercase tracking-wider" style={{ color: '#94A3B8' }}>
                Photos
              </h2>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {images.map((img, i) => (
                <button
                  key={img.id}
                  onClick={() => setLightboxIndex(i)}
                  className="aspect-square rounded-lg overflow-hidden hover:opacity-80 transition-opacity"
                  style={{ background: '#0F172A' }}
                >
                  <img
                    src={img.signed_url!}
                    alt={img.file_name}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </button>
              ))}
            </div>
          </section>
        )}

        {/* PDFs */}
        {pdfs.length > 0 && (
          <section className="rounded-xl p-4" style={{ background: '#1E293B' }}>
            <div className="flex items-center gap-2 mb-3">
              <FileText size={18} style={{ color: '#1FA0E5' }} />
              <h2 className="font-semibold text-sm uppercase tracking-wider" style={{ color: '#94A3B8' }}>
                Documents
              </h2>
            </div>
            <div className="space-y-2">
              {pdfs.map(pdf => (
                <a
                  key={pdf.id}
                  href={pdf.signed_url!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:brightness-110"
                  style={{ background: '#0F172A' }}
                >
                  <Download size={16} style={{ color: '#1FA0E5' }} />
                  <span className="text-sm truncate">{pdf.file_name}</span>
                </a>
              ))}
            </div>
          </section>
        )}

        {/* Print Invoice button — show if there are line items */}
        {job.line_items.length > 0 && job.job_total > 0 && (
          <button
            onClick={() => setShowInvoice(true)}
            className="w-full rounded-xl p-4 text-center transition-colors hover:brightness-110 flex items-center justify-center gap-2"
            style={{ background: '#1E293B', color: '#F8FAFC', border: '1px solid #334155' }}
          >
            <Printer size={18} />
            <span className="text-sm font-semibold">Print Invoice</span>
          </button>
        )}

        {/* Schedule Service CTA */}
        <a
          href="https://stmobileauto.com/shop-forms/"
          target="_blank"
          rel="noopener noreferrer"
          className="block rounded-xl p-4 text-center transition-colors hover:brightness-110"
          style={{ background: 'linear-gradient(135deg, #1FA0E5 0%, #1480BA 100%)' }}
        >
          <div className="flex items-center justify-center gap-2">
            <CalendarPlus size={18} />
            <span className="text-sm font-semibold">Schedule Your Next Service</span>
          </div>
        </a>
      </main>

      {/* Footer */}
      <footer className="border-t px-4 py-6 mt-4" style={{ borderColor: '#334155', background: '#1E293B' }}>
        <div className="max-w-2xl mx-auto text-center space-y-3">
          <p className="text-sm font-semibold" style={{ color: '#F8FAFC' }}>
            ST Mobile Automotive
          </p>
          <p className="text-xs" style={{ color: '#94A3B8' }}>
            Diagnostics · Programming · ADAS · Keys
          </p>
          <div className="flex items-center justify-center gap-6">
            <a href="tel:6123559566" className="flex items-center gap-1.5 text-xs transition-colors hover:brightness-125" style={{ color: '#1FA0E5' }}>
              <Phone size={13} />
              (612) 355-9566
            </a>
            <a href="https://stmobileauto.com" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs transition-colors hover:brightness-125" style={{ color: '#1FA0E5' }}>
              <Globe size={13} />
              stmobileauto.com
            </a>
          </div>
        </div>
      </footer>

      {/* Lightbox */}
      {lightboxIndex !== null && images[lightboxIndex] && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.9)' }}
          onClick={() => setLightboxIndex(null)}
        >
          {/* Close */}
          <button
            onClick={() => setLightboxIndex(null)}
            className="absolute top-4 right-4 p-2 rounded-full hover:bg-white/10 transition-colors"
            style={{ color: '#F8FAFC' }}
          >
            <X size={24} />
          </button>

          {/* Previous */}
          {lightboxIndex > 0 && (
            <button
              onClick={e => { e.stopPropagation(); navigateLightbox(-1) }}
              className="absolute left-2 p-2 rounded-full hover:bg-white/10 transition-colors"
              style={{ color: '#F8FAFC' }}
            >
              <ChevronLeft size={28} />
            </button>
          )}

          {/* Image */}
          <img
            src={images[lightboxIndex].signed_url!}
            alt={images[lightboxIndex].file_name}
            className="max-w-[90vw] max-h-[85vh] object-contain rounded-lg"
            onClick={e => e.stopPropagation()}
          />

          {/* Next */}
          {lightboxIndex < images.length - 1 && (
            <button
              onClick={e => { e.stopPropagation(); navigateLightbox(1) }}
              className="absolute right-2 p-2 rounded-full hover:bg-white/10 transition-colors"
              style={{ color: '#F8FAFC' }}
            >
              <ChevronRight size={28} />
            </button>
          )}

          {/* Counter */}
          <div className="absolute bottom-4 text-xs" style={{ color: '#94A3B8' }}>
            {lightboxIndex + 1} / {images.length}
          </div>
        </div>
      )}
      {/* Invoice overlay */}
      {showInvoice && (
        <div className="fixed inset-0 z-50 overflow-auto" style={{ background: '#f5f5f5' }}>
          <style>{`@media print { .no-print { display: none !important; } @page { margin: 0.5in; } }`}</style>
          
          {/* Print bar */}
          <div className="no-print" style={{ maxWidth: 680, margin: '0 auto', padding: '20px 0', display: 'flex', gap: 12, justifyContent: 'center' }}>
            <button
              onClick={() => window.print()}
              style={{ padding: '12px 28px', fontSize: 14, fontWeight: 600, border: 'none', borderRadius: 8, cursor: 'pointer', background: '#0F172A', color: '#fff' }}
            >🖨️ Print Invoice</button>
            <button
              onClick={() => setShowInvoice(false)}
              style={{ padding: '12px 28px', fontSize: 14, fontWeight: 600, border: '1px solid #ccc', borderRadius: 8, cursor: 'pointer', background: '#fff', color: '#333' }}
            >← Back to Job</button>
          </div>

          <div style={{ maxWidth: 680, margin: '0 auto 40px', background: '#fff', borderRadius: 8, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}>
            {/* Header */}
            <div style={{ background: '#0F172A', color: '#fff', padding: '28px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ width: 80, height: 80, borderRadius: 10, overflow: 'hidden' }}>
                  <img src="/st-mobile-logo.png" alt="ST Mobile" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                </div>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>ST Mobile LLC</div>
                  <div style={{ fontSize: 10, textTransform: 'uppercase' as const, letterSpacing: 2, color: '#1FA0E5', fontWeight: 600, marginTop: 2 }}>Automotive Technology Services</div>
                </div>
              </div>
              <div style={{ textAlign: 'right' as const }}>
                <div style={{ fontSize: 10, textTransform: 'uppercase' as const, letterSpacing: 2, color: '#64748B' }}>Invoice</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: '#1FA0E5', marginTop: 2 }}>
                  {job.invoice_number ? `#${job.invoice_number}` : '—'}
                </div>
                <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 4 }}>
                  {formattedDate || '—'}
                </div>
              </div>
            </div>

            {/* Bill To + Status */}
            <div style={{ display: 'flex', gap: 24, padding: '24px 32px', borderBottom: '1px solid #E2E8F0' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 9, textTransform: 'uppercase' as const, letterSpacing: 1.5, color: '#94A3B8', fontWeight: 600, marginBottom: 6 }}>Bill To</div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{job.customer_name || '—'}</div>
                {job.customer_address && <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>{job.customer_address}</div>}
                {job.customer_phone && <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>{job.customer_phone}</div>}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 9, textTransform: 'uppercase' as const, letterSpacing: 1.5, color: '#94A3B8', fontWeight: 600, marginBottom: 6 }}>Service Date</div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{formattedDate || '—'}</div>
                <div style={{ fontSize: 9, textTransform: 'uppercase' as const, letterSpacing: 1.5, color: '#94A3B8', fontWeight: 600, marginTop: 8 }}>Status</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: job.payment_status === 'paid' ? '#22C55E' : '#F59E0B' }}>
                  {job.payment_status === 'paid' ? '⬤ Paid' : '⬤ Balance Due'}
                </div>
              </div>
            </div>

            {/* Vehicle */}
            {job.vehicles.length > 0 && (
              <div style={{ padding: '20px 32px', borderBottom: '1px solid #E2E8F0' }}>
                {job.vehicles.map((v, i) => (
                  <div key={i}>
                    <div style={{ fontSize: 15, fontWeight: 600 }}>
                      {[v.year, v.make, v.model].filter(Boolean).join(' ') || 'Unknown Vehicle'}
                    </div>
                    {v.vin && <div style={{ fontSize: 11, fontFamily: 'monospace', color: '#94A3B8', marginTop: 1 }}>VIN: {v.vin}</div>}
                  </div>
                ))}
              </div>
            )}

            {/* Line items */}
            <div style={{ padding: '0 32px' }}>
              <div style={{ display: 'flex', padding: '16px 0 8px', borderBottom: '2px solid #0F172A', fontSize: 9, textTransform: 'uppercase' as const, letterSpacing: 1.5, color: '#94A3B8', fontWeight: 600 }}>
                <div style={{ flex: 1 }}>Description</div>
                <div style={{ width: 80, textAlign: 'right' as const }}>Amount</div>
              </div>
              {job.line_items.map((item, i) => (
                <div key={i} style={{ display: 'flex', padding: '14px 0', borderBottom: i < job.line_items.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{item.description}</div>
                    {item.notes && <div style={{ fontSize: 11, color: '#64748B', marginTop: 4, lineHeight: 1.4 }}>{item.notes}</div>}
                  </div>
                  <div style={{ width: 80, textAlign: 'right' as const, fontSize: 14, fontWeight: 600, paddingTop: 1 }}>
                    {item.total != null && item.total > 0 ? formatCurrency(item.total) : ''}
                  </div>
                </div>
              ))}
            </div>

            {/* Total */}
            <div style={{ padding: '20px 32px', borderTop: '2px solid #0F172A', display: 'flex', justifyContent: 'flex-end' }}>
              <div style={{ textAlign: 'right' as const }}>
                <div style={{ fontSize: 10, textTransform: 'uppercase' as const, letterSpacing: 1.5, color: '#94A3B8', fontWeight: 600 }}>Total Due</div>
                <div style={{ fontSize: 28, fontWeight: 800, color: '#0F172A', marginTop: 2 }}>{formatCurrency(job.job_total)}</div>
              </div>
            </div>

            {/* Pay online */}
            {job.qb_invoice_link && job.payment_status !== 'paid' && (
              <div className="no-print" style={{ margin: '0 32px 24px', padding: '16px 20px', background: '#F0F7FF', borderRadius: 8, borderLeft: '4px solid #1FA0E5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 13, color: '#334155' }}>
                  <strong style={{ color: '#0F172A' }}>Pay online:</strong> Quick, secure payment via QuickBooks
                </div>
                <a href={job.qb_invoice_link} target="_blank" rel="noopener noreferrer"
                  style={{ display: 'inline-block', padding: '10px 24px', background: '#1FA0E5', color: '#fff', fontSize: 13, fontWeight: 600, borderRadius: 6, textDecoration: 'none' }}>
                  Pay Now →
                </a>
              </div>
            )}

            {/* Footer */}
            <div style={{ background: '#F8FAFC', borderTop: '1px solid #E2E8F0', padding: '20px 32px', textAlign: 'center' as const }}>
              <div style={{ fontSize: 12, color: '#64748B' }}>
                <a href="tel:6123559566" style={{ color: '#1FA0E5', textDecoration: 'none' }}>(612) 355-9566</a>
                {' · '}
                <a href="mailto:info@stmobileauto.com" style={{ color: '#1FA0E5', textDecoration: 'none' }}>info@stmobileauto.com</a>
                {' · '}
                <a href="https://stmobileauto.com" target="_blank" rel="noopener noreferrer" style={{ color: '#1FA0E5', textDecoration: 'none' }}>stmobileauto.com</a>
              </div>
              <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 8 }}>Thank you for your business — ST Mobile LLC, Spring Lake Park, MN</div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
