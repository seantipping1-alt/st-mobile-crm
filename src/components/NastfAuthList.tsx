import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Search, ChevronDown, ChevronUp, FileText, Download, X } from 'lucide-react'

type NastfAuth = {
  id: string
  form_type: string
  vin: string
  vehicle: string | null
  vehicle_color: string | null
  mileage: string | null
  license_plate: string | null
  license_plate_state: string | null
  owner_name: string | null
  owner_email: string | null
  owner_phone: string | null
  owner_address: string | null
  owner_city: string | null
  owner_state: string | null
  owner_zip: string | null
  dl_number: string | null
  dl_state: string | null
  verification_type: string | null
  business_name: string | null
  business_email: string | null
  business_phone: string | null
  business_address: string | null
  business_city: string | null
  business_state: string | null
  business_zip: string | null
  business_manager: string | null
  business_contact_title: string | null
  vehicle_location: string | null
  po_number: string | null
  notes: string | null
  authorization_confirmed: boolean
  auth_date: string | null
  dl_photo_path: string | null
  ownership_proof_path: string | null
  work_order_path: string | null
  signature_data: string | null
  created_at: string
}

const FORM_TYPE_LABELS: Record<string, string> = {
  customer: 'Customer',
  contractor: 'Contractor',
  fleet: 'Fleet/Auction',
}

const FORM_TYPE_COLORS: Record<string, string> = {
  customer: 'bg-blue-900/40 text-blue-300',
  contractor: 'bg-purple-900/40 text-purple-300',
  fleet: 'bg-amber-900/40 text-amber-300',
}

function formatDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

export default function NastfAuthList() {
  const [auths, setAuths] = useState<NastfAuth[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [docModal, setDocModal] = useState<{ url: string; title: string } | null>(null)

  useEffect(() => {
    loadAuths()
  }, [])

  async function loadAuths() {
    setLoading(true)
    const { data, error } = await supabase
      .from('nastf_authorizations')
      .select('*')
      .order('created_at', { ascending: false })
    
    if (error) {
      console.error('Error loading auths:', error)
    } else {
      setAuths(data || [])
    }
    setLoading(false)
  }

  async function getSignedUrl(path: string) {
    const { data, error } = await supabase.storage
      .from('nastf-docs')
      .createSignedUrl(path, 300) // 5 min expiry
    if (error) {
      console.error('Error getting signed URL:', error)
      return null
    }
    return data.signedUrl
  }

  async function viewDocument(path: string, title: string) {
    const url = await getSignedUrl(path)
    if (url) {
      setDocModal({ url, title })
    }
  }

  async function downloadDocument(path: string, filename: string) {
    const url = await getSignedUrl(path)
    if (url) {
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.target = '_blank'
      a.click()
    }
  }

  // Filter
  let displayed = [...auths]
  if (typeFilter) {
    displayed = displayed.filter(a => a.form_type === typeFilter)
  }
  if (search.trim()) {
    const q = search.trim().toLowerCase()
    displayed = displayed.filter(a => {
      return (
        (a.vin || '').toLowerCase().includes(q) ||
        (a.vehicle || '').toLowerCase().includes(q) ||
        (a.owner_name || '').toLowerCase().includes(q) ||
        (a.business_name || '').toLowerCase().includes(q) ||
        (a.business_manager || '').toLowerCase().includes(q)
      )
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-[var(--color-muted)]">
        Loading authorizations...
      </div>
    )
  }

  return (
    <div>
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)]" />
          <input
            type="text"
            placeholder="Search VIN, vehicle, name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-[var(--color-surface)] border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[var(--color-primary)]"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="bg-[var(--color-surface)] border border-gray-700 rounded-lg text-sm text-white px-3 py-2 focus:outline-none focus:border-[var(--color-primary)]"
        >
          <option value="">All Types</option>
          <option value="customer">Customer</option>
          <option value="contractor">Contractor</option>
          <option value="fleet">Fleet/Auction</option>
        </select>
      </div>

      {/* Count */}
      <p className="text-xs text-[var(--color-muted)] mb-3">
        {displayed.length} authorization{displayed.length !== 1 ? 's' : ''}
      </p>

      {displayed.length === 0 ? (
        <div className="text-center py-16 text-[var(--color-muted)]">
          <FileText size={32} className="mx-auto mb-3 opacity-50" />
          <p className="text-sm">No authorizations found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {displayed.map((auth) => {
            const expanded = expandedId === auth.id
            return (
              <div key={auth.id} className="bg-[var(--color-surface)] border border-gray-800 rounded-lg overflow-hidden">
                {/* Summary row */}
                <button
                  onClick={() => setExpandedId(expanded ? null : auth.id)}
                  className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-white/5 transition cursor-pointer"
                >
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${FORM_TYPE_COLORS[auth.form_type] || 'bg-gray-700 text-gray-300'}`}>
                    {FORM_TYPE_LABELS[auth.form_type] || auth.form_type}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-white truncate">
                      {auth.vehicle || auth.vin}
                    </div>
                    <div className="text-xs text-[var(--color-muted)]">
                      {auth.owner_name || auth.business_name || auth.business_manager || '—'} · {formatDate(auth.created_at)}
                    </div>
                  </div>
                  <div className="text-xs text-[var(--color-muted)]">
                    {formatTime(auth.created_at)}
                  </div>
                  {expanded ? <ChevronUp size={16} className="text-[var(--color-muted)]" /> : <ChevronDown size={16} className="text-[var(--color-muted)]" />}
                </button>

                {/* Expanded details */}
                {expanded && (
                  <div className="px-4 pb-4 border-t border-gray-800">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 pt-4">
                      {/* Vehicle info */}
                      <div>
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)] mb-2">Vehicle</h3>
                        <Detail label="Vehicle" value={auth.vehicle} />
                        <Detail label="VIN" value={auth.vin} mono />
                        <Detail label="Color" value={auth.vehicle_color} />
                        <Detail label="Mileage" value={auth.mileage} />
                        <Detail label="Plate" value={auth.license_plate ? `${auth.license_plate}${auth.license_plate_state ? ` (${auth.license_plate_state})` : ''}` : null} />
                        {auth.vehicle_location && <Detail label="Location" value={auth.vehicle_location} />}
                      </div>

                      {/* Owner / Business info */}
                      <div>
                        {(auth.form_type === 'customer' || auth.owner_name) && (
                          <>
                            <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)] mb-2">Owner</h3>
                            <Detail label="Name" value={auth.owner_name} />
                            <Detail label="Email" value={auth.owner_email} />
                            <Detail label="Phone" value={auth.owner_phone} />
                            {auth.owner_address && (
                              <Detail label="Address" value={`${auth.owner_address}, ${auth.owner_city || ''} ${auth.owner_state || ''} ${auth.owner_zip || ''}`.trim()} />
                            )}
                          </>
                        )}
                        {(auth.form_type === 'contractor' || auth.form_type === 'fleet') && auth.business_name && (
                          <>
                            <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)] mb-2 mt-3">Business</h3>
                            <Detail label="Business" value={auth.business_name} />
                            <Detail label="Manager" value={auth.business_manager} />
                            <Detail label="Email" value={auth.business_email} />
                            <Detail label="Phone" value={auth.business_phone} />
                            {auth.business_address && (
                              <Detail label="Address" value={`${auth.business_address}, ${auth.business_city || ''} ${auth.business_state || ''} ${auth.business_zip || ''}`.trim()} />
                            )}
                            {auth.business_contact_title && <Detail label="Title" value={auth.business_contact_title} />}
                          </>
                        )}
                      </div>

                      {/* ID Verification */}
                      {(auth.dl_number || auth.verification_type) && (
                        <div>
                          <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)] mb-2">Verification</h3>
                          <Detail label="DL Number" value={auth.dl_number} />
                          <Detail label="DL State" value={auth.dl_state} />
                          <Detail label="Proof Type" value={auth.verification_type} />
                        </div>
                      )}

                      {/* Authorization */}
                      <div>
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)] mb-2">Authorization</h3>
                        <Detail label="Authorized" value={auth.authorization_confirmed ? '✓ Yes' : '✕ No'} />
                        <Detail label="Date" value={auth.auth_date} />
                        {auth.po_number && <Detail label="PO/WO #" value={auth.po_number} />}
                        {auth.notes && <Detail label="Notes" value={auth.notes} />}
                      </div>
                    </div>

                    {/* Documents */}
                    <div className="mt-4 pt-4 border-t border-gray-800">
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)] mb-2">Documents</h3>
                      <div className="flex flex-wrap gap-2">
                        {auth.dl_photo_path && (
                          <DocButton label="Driver's License" path={auth.dl_photo_path} onView={viewDocument} onDownload={downloadDocument} />
                        )}
                        {auth.ownership_proof_path && (
                          <DocButton label="Proof of Ownership" path={auth.ownership_proof_path} onView={viewDocument} onDownload={downloadDocument} />
                        )}
                        {auth.work_order_path && (
                          <DocButton label="Work Order" path={auth.work_order_path} onView={viewDocument} onDownload={downloadDocument} />
                        )}
                        {auth.signature_data && (
                          <DocButton label="Signature" path={auth.signature_data} onView={viewDocument} onDownload={downloadDocument} />
                        )}
                        {!auth.dl_photo_path && !auth.ownership_proof_path && !auth.work_order_path && !auth.signature_data && (
                          <span className="text-xs text-[var(--color-muted)]">No documents uploaded</span>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Document viewer modal */}
      {docModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setDocModal(null)}>
          <div className="bg-[var(--color-surface)] rounded-xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
              <h3 className="text-sm font-semibold text-white">{docModal.title}</h3>
              <button onClick={() => setDocModal(null)} className="text-[var(--color-muted)] hover:text-white transition cursor-pointer">
                <X size={18} />
              </button>
            </div>
            <div className="p-4 overflow-auto max-h-[70vh]">
              <img src={docModal.url} alt={docModal.title} className="max-w-full rounded-lg" />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Detail({ label, value, mono }: { label: string; value: string | null | undefined; mono?: boolean }) {
  if (!value) return null
  return (
    <div className="flex gap-2 text-sm mb-1">
      <span className="text-[var(--color-muted)] shrink-0">{label}:</span>
      <span className={`text-white ${mono ? 'font-mono text-xs mt-0.5' : ''}`}>{value}</span>
    </div>
  )
}

function DocButton({ label, path, onView, onDownload }: {
  label: string
  path: string
  onView: (path: string, title: string) => void
  onDownload: (path: string, filename: string) => void
}) {
  const filename = path.split('/').pop() || 'document'
  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => onView(path, label)}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded-md text-xs text-white transition cursor-pointer"
      >
        <FileText size={12} />
        {label}
      </button>
      <button
        onClick={() => onDownload(path, filename)}
        className="p-1.5 bg-gray-800 hover:bg-gray-700 rounded-md text-[var(--color-muted)] hover:text-white transition cursor-pointer"
        title="Download"
      >
        <Download size={12} />
      </button>
    </div>
  )
}
