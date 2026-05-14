import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Save, Trash2, Plus, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { deleteJob, getJobLineItems, getJobVehicles, saveJobLineItems, getServices, type Service } from '../lib/db'
import { toast } from '../components/Toast'

const STATUSES = ['scheduled', 'in_progress', 'complete', 'invoiced', 'paid', 'cancelled']
const STATUS_LABELS: Record<string, string> = {
  scheduled: 'Scheduled', in_progress: 'In Progress', complete: 'Complete',
  invoiced: 'Invoiced', paid: 'Paid', cancelled: 'Cancelled'
}
const CATEGORY_LABELS: Record<string, string> = {
  diagnostic: 'Diagnostic', programming: 'Programming', adas: 'ADAS', keys: 'Keys', other: 'Other'
}

export default function JobDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [job, setJob] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [findings, setFindings] = useState('')
  const [notes, setNotes] = useState('')
  const [lineItems, setLineItems] = useState<any[]>([])
  const [jobVehicles, setJobVehicles] = useState<any[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [customDesc, setCustomDesc] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => { loadJob() }, [id])

  async function loadJob() {
    const { data, error } = await supabase.from('jobs')
      .select('*, customers(name)')
      .eq('id', id).single()
    if (error) { console.error('loadJob error', error) }
    if (data) {
      let team = null
      if (data.assigned_to) {
        const { data: teamData } = await supabase.from('team')
          .select('name,color').eq('id', data.assigned_to).single()
        team = teamData
      }
      try {
        const jv = await getJobVehicles(data.id)
        setJobVehicles(jv)
      } catch (_) {}
      setJob({ ...data, team })
      setFindings(data.findings || '')
      setNotes(data.internal_notes || '')
      try {
        const items = await getJobLineItems(data.id)
        setLineItems(items)
      } catch (_) {}
      try {
        const svcs = await getServices()
        setServices(svcs)
      } catch (_) {}
    }
    setLoading(false)
  }

  async function updateStatus(status: string) {
    setSaving(true)
    const updates: any = { status }
    if (status === 'complete') updates.completed_at = new Date().toISOString()
    await supabase.from('jobs').update(updates).eq('id', id)
    setJob({ ...job, status })
    setSaving(false)
    toast('Status updated ✓')
  }

  async function saveDetails() {
    setSaving(true)
    await supabase.from('jobs').update({
      findings,
      internal_notes: notes,
    }).eq('id', id)
    setSaving(false)
    toast('Details saved ✓')
  }

  async function saveLineItems() {
    if (!id) return
    setSaving(true)
    try {
      await saveJobLineItems(id, lineItems)
      toast('Services saved ✓')
    } catch (err) { console.error(err) }
    setSaving(false)
  }

  function addServiceFromCatalog(service: Service) {
    const vehicleIds = jobVehicles.map((jv: any) => jv.vehicles?.id).filter(Boolean)
    setLineItems([...lineItems, {
      service_id: service.id,
      vehicle_id: vehicleIds.length === 1 ? vehicleIds[0] : null,
      description: service.name,
      quantity: 1,
      unit_price: service.default_rate || 0,
      category: 'labor',
      qb_item_id: service.qb_item_id,
    }])
  }

  function addCustomService() {
    if (!customDesc.trim()) return
    const vehicleIds = jobVehicles.map((jv: any) => jv.vehicles?.id).filter(Boolean)
    setLineItems([...lineItems, {
      service_id: null,
      vehicle_id: vehicleIds.length === 1 ? vehicleIds[0] : null,
      description: customDesc.trim(),
      quantity: 1,
      unit_price: 0,
      category: 'labor',
      qb_item_id: null,
    }])
    setCustomDesc('')
  }

  function updateLineItem(index: number, field: string, value: any) {
    setLineItems(lineItems.map((li: any, i: number) => i === index ? { ...li, [field]: value } : li))
  }

  function removeLineItem(index: number) {
    setLineItems(lineItems.filter((_: any, i: number) => i !== index))
  }

  async function handleDelete() {
    if (!id) return
    setDeleting(true)
    try {
      await deleteJob(id)
      navigate('/jobs')
    } catch (err) {
      console.error(err)
      setDeleting(false)
      setShowDeleteConfirm(false)
    }
  }

  if (loading) return <div className="p-6 text-[var(--color-muted)]">Loading...</div>
  if (!job) return <div className="p-6 text-red-400">Job not found</div>

  const currentIdx = STATUSES.indexOf(job.status)
  const vehicleList = jobVehicles.map((jv: any) => jv.vehicles).filter(Boolean)
  const hasMultipleVehicles = vehicleList.length > 1

  // Group services by category for dropdown
  const servicesByCategory: Record<string, Service[]> = {}
  services.forEach((s) => {
    const cat = s.category || 'other'
    if (!servicesByCategory[cat]) servicesByCategory[cat] = []
    servicesByCategory[cat].push(s)
  })

  // Group line items by vehicle for display
  const groupedItems: { vehicle: any | null; items: any[] }[] = []
  if (hasMultipleVehicles) {
    vehicleList.forEach((v: any) => {
      const items = lineItems.filter((li: any) => li.vehicle_id === v.id)
      if (items.length > 0) groupedItems.push({ vehicle: v, items })
    })
    const unlinked = lineItems.filter((li: any) => !li.vehicle_id || !vehicleList.some((v: any) => v.id === li.vehicle_id))
    if (unlinked.length > 0) groupedItems.push({ vehicle: null, items: unlinked })
  } else {
    groupedItems.push({ vehicle: vehicleList[0] || null, items: lineItems })
  }

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => navigate('/jobs')} className="text-[var(--color-muted)] hover:text-white"><ArrowLeft size={20} /></button>
        <div className="flex-1">
          <h1 className="text-xl font-bold">{job.customers?.name || 'Unknown Customer'}</h1>
          <p className="text-xs text-[var(--color-muted)]">
            {jobVehicles.length > 0
              ? jobVehicles.map((jv: any, i: number) => {
                  const v = jv.vehicles
                  return <span key={i}>{i > 0 && ' · '}{v?.year} {v?.make} {v?.model}{v?.vin && <span className="ml-1 font-mono">({v.vin})</span>}</span>
                })
              : 'No vehicle'}
          </p>
        </div>
        <button onClick={() => setShowDeleteConfirm(true)}
          className="text-gray-500 hover:text-red-400 transition p-2" title="Delete job">
          <Trash2 size={18} />
        </button>
      </div>

      <div className="space-y-4">
        {/* Status flow */}
        <div className="bg-[var(--color-surface)] rounded-lg p-4">
          <label className="block text-xs text-[var(--color-muted)] mb-3">Status</label>
          <div className="flex gap-2">
            {STATUSES.map((s, i) => (
              <button key={s} onClick={() => updateStatus(s)} disabled={saving}
                className={`flex-1 py-2 rounded-lg text-xs font-medium transition ${
                  job.status === s
                    ? 'bg-[var(--color-primary)] text-white'
                    : i <= currentIdx
                    ? 'bg-green-900/30 text-green-400 hover:bg-green-900/50'
                    : 'bg-[var(--color-bg)] text-gray-600 hover:text-gray-400'
                }`}>
                {STATUS_LABELS[s]}
              </button>
            ))}
          </div>
        </div>

        {/* Job details */}
        <div className="bg-[var(--color-surface)] rounded-lg p-4">
          <div className="grid grid-cols-2 gap-3 text-sm mb-4">
            <div>
              <span className="text-xs text-[var(--color-muted)]">Job Type</span>
              <p className="text-white capitalize">{job.job_type}</p>
            </div>
            <div>
              <span className="text-xs text-[var(--color-muted)]">Assigned To</span>
              <p style={{ color: job.team?.color || 'white' }}>{job.team?.name || 'Unassigned'}</p>
            </div>
            <div>
              <span className="text-xs text-[var(--color-muted)]">Priority</span>
              <p className="text-white capitalize">{job.priority}</p>
            </div>
            <div>
              <span className="text-xs text-[var(--color-muted)]">Shop RO #</span>
              <p className="text-white">{job.shop_ro_number || '—'}</p>
            </div>
          </div>

          {job.problem_description && (
            <div className="mb-3">
              <span className="text-xs text-[var(--color-muted)]">Job Description</span>
              <p className="text-white text-sm mt-0.5 whitespace-pre-wrap">{job.problem_description}</p>
            </div>
          )}

          {/* Findings */}
          <div className="mb-3">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Findings</label>
            <textarea value={findings} onChange={(e) => setFindings(e.target.value)} rows={3}
              placeholder="What did the tech find?"
              className="w-full bg-[var(--color-bg)] border border-gray-700 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-[var(--color-primary)] resize-none" />
          </div>

          {/* Internal notes */}
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Internal Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
              className="w-full bg-[var(--color-bg)] border border-gray-700 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-[var(--color-primary)] resize-none" />
          </div>

          <button onClick={saveDetails} disabled={saving}
            className="mt-3 bg-[var(--color-primary)] text-white px-4 py-1.5 rounded text-sm flex items-center gap-1.5 hover:brightness-110 transition">
            <Save size={14} />Save Details
          </button>
        </div>

        {/* Services / line items — editable */}
        <div className="bg-[var(--color-surface)] rounded-lg p-4">
          <label className="block text-xs text-[var(--color-muted)] mb-3">Services / Line Items</label>

          {/* Add from catalog */}
          {services.length > 0 && (
            <select value="" onChange={(e) => { const svc = services.find((s) => s.id === e.target.value); if (svc) addServiceFromCatalog(svc) }}
              className="w-full bg-[var(--color-bg)] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--color-primary)] mb-2">
              <option value="">+ Add from canned services...</option>
              {Object.entries(servicesByCategory).map(([cat, svcs]) => (
                <optgroup key={cat} label={CATEGORY_LABELS[cat] || cat}>
                  {svcs.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}{s.default_rate > 0 ? ` — $${s.default_rate}` : ''}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          )}

          {/* Custom service */}
          <div className="flex gap-2 mb-3">
            <input type="text" value={customDesc} onChange={(e) => setCustomDesc(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCustomService())}
              placeholder="Or type a custom service..."
              className="flex-1 bg-[var(--color-bg)] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--color-primary)]" />
            <button onClick={addCustomService}
              className="bg-[var(--color-bg)] border border-gray-700 rounded-lg px-3 py-2 text-[var(--color-muted)] hover:text-white hover:border-[var(--color-primary)] transition">
              <Plus size={16} />
            </button>
          </div>

          {/* Line items grouped by vehicle */}
          {lineItems.length > 0 && (
            <div className="space-y-3">
              {groupedItems.map((group, gi) => (
                <div key={gi}>
                  {hasMultipleVehicles && (
                    <p className="text-xs text-[var(--color-muted)] mb-1 font-medium">
                      {group.vehicle ? `${group.vehicle.year} ${group.vehicle.make} ${group.vehicle.model}` : 'No vehicle assigned'}
                    </p>
                  )}
                  <div className="space-y-1">
                    {group.items.map((li: any) => {
                      const idx = lineItems.indexOf(li)
                      return (
                        <div key={idx} className="flex items-center gap-2 bg-[var(--color-bg)] rounded-lg px-3 py-2">
                          <div className="flex-1">
                            <span className="text-white text-sm">{li.description}</span>
                          </div>
                          {hasMultipleVehicles && (
                            <select value={li.vehicle_id || ''} onChange={(e) => updateLineItem(idx, 'vehicle_id', e.target.value || null)}
                              className="bg-[var(--color-surface)] border border-gray-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-[var(--color-primary)] max-w-[140px]">
                              <option value="">No vehicle</option>
                              {vehicleList.map((v: any) => (
                                <option key={v.id} value={v.id}>{v.year} {v.make} {v.model}</option>
                              ))}
                            </select>
                          )}
                          <div className="flex items-center gap-1">
                            <input type="number" min="1" value={li.quantity}
                              onChange={(e) => updateLineItem(idx, 'quantity', parseInt(e.target.value) || 1)}
                              className="w-12 bg-[var(--color-surface)] border border-gray-700 rounded px-2 py-1 text-xs text-white text-center focus:outline-none focus:border-[var(--color-primary)]" />
                            <span className="text-xs text-[var(--color-muted)]">×$</span>
                            <input type="number" min="0" step="0.01" value={li.unit_price || ''}
                              onChange={(e) => updateLineItem(idx, 'unit_price', parseFloat(e.target.value) || 0)}
                              placeholder="0"
                              className="w-16 bg-[var(--color-surface)] border border-gray-700 rounded px-2 py-1 text-xs text-white text-right focus:outline-none focus:border-[var(--color-primary)]" />
                          </div>
                          <button onClick={() => removeLineItem(idx)} className="text-gray-600 hover:text-red-400"><X size={14} /></button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
              {lineItems.some((li: any) => li.unit_price > 0) && (
                <div className="flex justify-end px-3 pt-1 border-t border-gray-800">
                  <span className="text-xs text-[var(--color-muted)]">Total: </span>
                  <span className="text-sm text-white font-medium ml-1">
                    ${lineItems.reduce((sum: number, li: any) => sum + ((li.quantity || 1) * (li.unit_price || 0)), 0).toFixed(2)}
                  </span>
                </div>
              )}
            </div>
          )}

          <button onClick={saveLineItems} disabled={saving}
            className="mt-3 bg-[var(--color-primary)] text-white px-4 py-1.5 rounded text-sm flex items-center gap-1.5 hover:brightness-110 transition">
            <Save size={14} />Save Services
          </button>
        </div>

        {/* Attachments — placeholder */}
        <div className="bg-[var(--color-surface)] rounded-lg p-4">
          <h3 className="text-sm font-medium text-[var(--color-muted)] mb-2">Attachments</h3>
          <p className="text-xs text-[var(--color-muted)]">Scan reports and photos — coming in Phase 4.</p>
        </div>
      </div>

      {/* Delete confirmation modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowDeleteConfirm(false)}>
          <div className="bg-[var(--color-surface)] rounded-lg p-6 max-w-sm w-full mx-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-white font-medium mb-2">Delete Job?</h3>
            <p className="text-sm text-[var(--color-muted)] mb-4">
              Are you sure you want to delete this job for <span className="text-white">{job.customers?.name || 'Unknown'}</span>?
              This can't be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 rounded-lg text-sm text-[var(--color-muted)] hover:text-white transition">
                No, Keep It
              </button>
              <button onClick={handleDelete} disabled={deleting}
                className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-500 disabled:opacity-50 transition">
                {deleting ? 'Deleting...' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
