import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Car, FileText, Wrench, Paperclip, Key, Monitor, ChevronRight, CreditCard, CheckCircle, Phone, Globe, CalendarPlus } from 'lucide-react'

const JOB_TYPE_ICONS: Record<string, any> = {
  diagnostic: Wrench,
  programming: Monitor,
  keys: Key,
  adas: Monitor,
  other: FileText,
}

const JOB_TYPE_LABELS: Record<string, string> = {
  diagnostic: 'Diagnostics',
  programming: 'Programming',
  keys: 'Keys',
  adas: 'ADAS',
  other: 'Service',
}

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

interface PortalJob {
  id: string
  scheduled_start: string | null
  completed_at: string | null
  job_type: string
  status: string
  shop_name: string | null
  payment_status: string | null
  qb_invoice_link: string | null
  invoice_number: string | null
  vehicles: Vehicle[]
  line_items: LineItem[]
  attachment_count: number
  job_total: number
}

interface PortalData {
  customer: {
    name: string
    type: string
  }
  jobs: PortalJob[]
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
}

export default function PublicPortalPage() {
  const { token } = useParams<{ token: string }>()
  const [data, setData] = useState<PortalData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return
    fetch(`/api/public-portal?token=${token}`)
      .then(res => {
        if (!res.ok) throw new Error('Portal not found')
        return res.json()
      })
      .then(d => setData(d))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [token])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0F172A' }}>
        <div className="animate-spin w-8 h-8 border-2 border-t-transparent rounded-full" style={{ borderColor: '#1FA0E5', borderTopColor: 'transparent' }} />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: '#0F172A', color: '#F8FAFC' }}>
        <div className="text-center">
          <h1 className="text-xl font-semibold mb-2">Portal Not Found</h1>
          <p style={{ color: '#94A3B8' }}>This link may be invalid. Contact ST Mobile if you need assistance.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ background: '#0F172A', color: '#F8FAFC' }}>
      {/* Header */}
      <header className="border-b px-4 py-5" style={{ borderColor: '#334155', background: '#1E293B' }}>
        <div className="max-w-2xl mx-auto">
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
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6">
        {/* Customer name banner */}
        <div className="rounded-xl px-4 py-3 mb-6" style={{ background: 'linear-gradient(135deg, #1E293B 0%, #0F172A 100%)', borderLeft: '3px solid #1FA0E5' }}>
          <p className="text-xs uppercase tracking-wider font-medium" style={{ color: '#64748B' }}>Customer Portal</p>
          <p className="text-xl font-semibold" style={{ color: '#F8FAFC' }}>{data.customer.name}</p>
        </div>

        {/* Job count summary */}
        <div className="mb-5">
          <p className="text-sm" style={{ color: '#94A3B8' }}>
            {data.jobs.length === 0
              ? 'No completed jobs yet.'
              : `${data.jobs.length} completed job${data.jobs.length === 1 ? '' : 's'}`}
          </p>
        </div>

        {/* Jobs list */}
        <div className="space-y-3">
          {data.jobs.map(job => {
            const Icon = JOB_TYPE_ICONS[job.job_type] || JOB_TYPE_ICONS.other
            const typeLabel = JOB_TYPE_LABELS[job.job_type] || JOB_TYPE_LABELS.other
            const dateStr = job.scheduled_start
              ? new Date(job.scheduled_start).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })
              : 'No date'

            const vehicleStr = job.vehicles
              .map(v => [v.year, v.make, v.model].filter(Boolean).join(' '))
              .filter(Boolean)
              .join(', ') || 'Vehicle info unavailable'

            const isPaid = job.payment_status === 'paid'
            const isPartial = job.payment_status === 'partial'
            const showAmount = job.job_total > 0

            return (
              <Link
                key={job.id}
                to={`/j/${job.id}`}
                className="block rounded-xl p-4 transition-colors hover:brightness-110"
                style={{ background: '#1E293B' }}
              >
                <div className="flex items-start gap-3">
                  {/* Icon */}
                  <div className="flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center mt-0.5"
                    style={{ background: '#0F172A' }}>
                    <Icon size={18} style={{ color: '#1FA0E5' }} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    {/* Date & type & payment */}
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-sm font-medium">{dateStr}</span>
                      <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: '#0F172A', color: '#94A3B8' }}>
                        {typeLabel}
                      </span>
                      {isPaid ? (
                        <span className="text-xs px-1.5 py-0.5 rounded flex items-center gap-1" style={{ background: '#052E16', color: '#22C55E' }}>
                          <CheckCircle size={10} /> Paid
                        </span>
                      ) : isPartial ? (
                        <span className="text-xs px-1.5 py-0.5 rounded flex items-center gap-1" style={{ background: '#422006', color: '#F59E0B' }}>
                          <CreditCard size={10} /> Partial
                        </span>
                      ) : job.status === 'invoiced' ? (
                        <span className="text-xs px-1.5 py-0.5 rounded flex items-center gap-1" style={{ background: '#1E293B', color: '#F59E0B' }}>
                          <CreditCard size={10} /> Invoiced
                        </span>
                      ) : null}
                    </div>

                    {/* Vehicle */}
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Car size={13} style={{ color: '#64748B' }} />
                      <p className="text-sm truncate" style={{ color: '#CBD5E1' }}>{vehicleStr}</p>
                    </div>

                    {/* Services performed (first 2) */}
                    {job.line_items.length > 0 && (
                      <div className="space-y-0.5">
                        {job.line_items.slice(0, 2).map((item, i) => (
                          <p key={i} className="text-xs truncate" style={{ color: '#94A3B8' }}>
                            {item.description}
                          </p>
                        ))}
                        {job.line_items.length > 2 && (
                          <p className="text-xs" style={{ color: '#64748B' }}>
                            +{job.line_items.length - 2} more
                          </p>
                        )}
                      </div>
                    )}

                    {/* Amount + Attachment count */}
                    <div className="flex items-center gap-3 mt-1.5">
                      {showAmount && (
                        <span className="text-sm font-semibold" style={{ color: isPaid ? '#22C55E' : '#F8FAFC' }}>
                          {formatCurrency(job.job_total)}
                        </span>
                      )}
                      {job.attachment_count > 0 && (
                        <div className="flex items-center gap-1">
                          <Paperclip size={11} style={{ color: '#64748B' }} />
                          <span className="text-xs" style={{ color: '#64748B' }}>
                            {job.attachment_count} file{job.attachment_count === 1 ? '' : 's'}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Chevron */}
                  <ChevronRight size={18} className="flex-shrink-0 mt-2" style={{ color: '#475569' }} />
                </div>
              </Link>
            )
          })}
        </div>

        {/* Schedule Service CTA */}
        <a
          href="https://stmobileauto.com/shop-forms/"
          target="_blank"
          rel="noopener noreferrer"
          className="block rounded-xl p-4 text-center transition-colors hover:brightness-110 mt-6"
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
    </div>
  )
}
