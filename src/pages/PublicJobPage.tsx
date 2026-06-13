import { useState, useEffect, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Car, FileText, Download, X, ChevronLeft, ChevronRight, Image, LayoutGrid, CreditCard, ExternalLink, Phone, Globe, CalendarPlus } from 'lucide-react'

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
    </div>
  )
}
