import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Save, Trash2, Plus, X, Search } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { deleteJob, getJobLineItems, getJobVehicles, saveJobLineItems, saveJobVehicles, saveVehicle, getServices, type Service } from '../lib/db'
import { toast } from '../components/Toast'

const STATUSES = ['scheduled', 'in_progress', 'complete', 'invoiced', 'paid', 'cancelled']
const STATUS_LABELS: Record<string, string> = {
  scheduled: 'Scheduled', in_progress: 'In Progress', complete: 'Complete',
  invoiced: 'Invoiced', paid: 'Paid', cancelled: 'Cancelled'
}
const CATEGORY_LABELS: Record<string, string> = {
  diagnostic: 'Diagnostic', programming: 'Programming', adas: 'ADAS', keys: 'Keys', fee: 'Fees', inventory: 'Inventory / Parts', other: 'Other'
}

export default function JobDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [job, setJob] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notes, setNotes] = useState('')
  const [lineItems, setLineItems] = useState<any[]>([])
  const [jobVehicles, setJobVehicles] = useState<any[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [customDesc, setCustomDesc] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showAddVehicle, setShowAddVehicle] = useState(false)
  const [vinInput, setVinInput] = useState('')
  const [vinDecoding, setVinDecoding] = useState(false)
  const [manualVehicle, setManualVehicle] = useState({ year: '', make: '', model: '', engine: '' })
  const [showManualEntry, setShowManualEntry] = useState(false)
  const [addingVehicle, setAddingVehicle] = useState(false)

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
      notes: service.default_notes || null,
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
      notes: null,
    }])
    setCustomDesc('')
  }

  function updateLineItem(index: number, field: string, value: any) {
    setLineItems(lineItems.map((li: any, i: number) => i === index ? { ...li, [field]: value } : li))
  }

  function removeLineItem(index: number) {
    setLineItems(lineItems.filter((_: any, i: number) => i !== index))
  }

  async function addVehicleByVin(vinValue: string) {
    const v = vinValue.toUpperCase().trim()
    if (v.length !== 17 || !job?.customer_id || !id) return
    setVinDecoding(true)
    try {
      let year = '', make = '', model = '', engine = ''
      try {
        const res = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/decodevin/${v}?format=json`)
        const json = await res.json()
        const getVal = (name: string) => json.Results.find((r: any) => r.Variable === name)?.Value || ''
        year = getVal('Model Year'); make = getVal('Make'); model = getVal('Model'); engine = getVal('Engine Model')
      } catch (_) {}
      const saved = await saveVehicle({
        customer_id: job.customer_id, vin: v,
        year: parseInt(year) || null, make: make || null, model: model || null, engine: engine || null,
      })
      const existingIds = jobVehicles.map((jv: any) => jv.vehicles?.id).filter(Boolean)
      await saveJobVehicles(id, [...existingIds, saved.id])
      await supabase.from('jobs').update({ vehicle_id: existingIds[0] || saved.id }).eq('id', id)
      setVinInput('')
      setShowAddVehicle(false)
      toast('Vehicle added ✓')
      loadJob()
    } catch (err) { console.error(err); toast('Failed to add vehicle') }
    setVinDecoding(false)
  }

  async function addVehicleManually() {
    if (!manualVehicle.make.trim() || !job?.customer_id || !id) return
    setAddingVehicle(true)
    try {
      const saved = await saveVehicle({
        customer_id: job.customer_id,
        year: parseInt(manualVehicle.year) || null,
        make: manualVehicle.make.trim() || null,
        model: manualVehicle.model.trim() || null,
        engine: manualVehicle.engine.trim() || null,
      })
      const existingIds = jobVehicles.map((jv: any) => jv.vehicles?.id).filter(Boolean)
      await saveJobVehicles(id, [...existingIds, saved.id])
      await supabase.from('jobs').update({ vehicle_id: existingIds[0] || saved.id }).eq('id', id)
      setManualVehicle({ year: '', make: '', model: '', engine: '' })
      setShowManualEntry(false)
      setShowAddVehicle(false)
      toast('Vehicle added ✓')
      loadJob()
    } catch (err) { console.error(err); toast('Failed to add vehicle') }
    setAddingVehicle(false)
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

  if (loading) return <div className="p-4 md:p-6 text-[var(--color-muted)]">Loading...</div>
  if (!job) return <div className="p-4 md:p-6 text-red-400">Job not found</div>

  const currentIdx = STATUSES.indexOf(job.status)
  const vehicleList = jobVehicles.map((jv: any) => jv.vehicles).filter(Boolean)
  const hasMultipleVehicles = vehicleList.length > 1

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
    <div className="p-4 md:p-6 max-w-2xl">
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
            <button onClick={() => setShowAddVehicle(!showAddVehicle)}
              className="ml-2 text-[var(--color-primary)] hover:underline inline-flex items-center gap-0.5">
              + Add vehicle
            </button>
          </p>
        </div>
        <button onClick={() => setShowDeleteConfirm(true)}
          className="text-gray-500 hover:text-red-400 transition p-2 min-h-[44px] min-w-[44px] flex items-center justify-center" title="Delete job">
          <Trash2 size={18} />
        </button>
      </div>

      {/* Add vehicle panel */}
      {showAddVehicle && (
        <div className="bg-[var(--color-surface)] rounded-lg p-4 mb-4">
          <label className="block text-xs text-[var(--color-muted)] mb-2">Add Vehicle</label>
          {!showManualEntry ? (
            <div>
              <div className="flex gap-2 mb-2">
                <input type="text" value={vinInput} onChange={(e) => {
                  const v = e.target.value.toUpperCase()
                  setVinInput(v)
                  if (v.length === 17) addVehicleByVin(v)
                }}
                  maxLength={17} placeholder="Enter VIN (auto-decodes at 17 chars)"
                  disabled={vinDecoding}
                  className="flex-1 bg-[var(--color-bg)] border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white font-mono focus:outline-none focus:border-[var(--color-primary)] disabled:opacity-50 min-h-[44px]" />
              </div>
              {vinDecoding && <p className="text-xs text-[var(--color-muted)] mb-2">Decoding VIN...</p>}
              <button onClick={() => setShowManualEntry(true)}
                className="text-[var(--color-primary)] text-xs hover:underline">Don't have the VIN? Enter manually</button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <input type="text" value={manualVehicle.year} onChange={(e) => setManualVehicle({ ...manualVehicle, year: e.target.value })}
                  placeholder="Year" maxLength={4}
                  className="bg-[var(--color-bg)] border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[var(--color-primary)] min-h-[44px]" />
                <input type="text" value={manualVehicle.make} onChange={(e) => setManualVehicle({ ...manualVehicle, make: e.target.value })}
                  placeholder="Make *"
                  className="bg-[var(--color-bg)] border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[var(--color-primary)] min-h-[44px]" />
                <input type="text" value={manualVehicle.model} onChange={(e) => setManualVehicle({ ...manualVehicle, model: e.target.value })}
                  placeholder="Model"
                  className="bg-[var(--color-bg)] border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[var(--color-primary)] min-h-[44px]" />
                <input type="text" value={manualVehicle.engine} onChange={(e) => setManualVehicle({ ...manualVehicle, engine: e.target.value })}
                  placeholder="Engine"
                  className="bg-[var(--color-bg)] border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[var(--color-primary)] min-h-[44px]" />
              </div>
              <div className="flex gap-2">
                <button onClick={addVehicleManually} disabled={addingVehicle || !manualVehicle.make.trim()}
                  className="bg-[var(--color-primary)] text-white px-4 py-2.5 rounded text-sm hover:brightness-110 disabled:opacity-50 transition min-h-[44px]">
                  {addingVehicle ? 'Adding...' : 'Add Vehicle'}
                </button>
                <button onClick={() => { setShowManualEntry(false); setManualVehicle({ year: '', make: '', model: '', engine: '' }) }}
                  className="text-[var(--color-muted)] text-xs hover:text-white">← Back to VIN</button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="space-y-4">
        {/* Status flow */}
        <div className="bg-[var(--color-surface)] rounded-lg p-4">
          <label className="block text-xs text-[var(--color-muted)] mb-3">Status</label>
          <div className="grid grid-cols-3 md:flex gap-2">
            {STATUSES.map((s, i) => (
              <button key={s} onClick={() => updateStatus(s)} disabled={saving}
                className={`flex-1 py-2.5 rounded-lg text-xs font-medium transition min-h-[44px] flex items-center justify-center ${
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm mb-4">
            <div>
              <span className="text-xs text-[var(--color-muted)]">Job Type</span>
              <p className="text-white capitalize">{job.job_type}</p>
            </div>
            <div>
              <span className="text-xs text-[var(--color-muted)]">Assigned To</span>
              <p style={{ color: job.team?.color || 'white' }}>{job.team?.name || 'Unassigned'}</p>
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

          {/* Internal notes */}
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Internal Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
              onInput={(e) => { const t = e.target as HTMLTextAreaElement; t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px' }}
              onFocus={(e) => { const t = e.target as HTMLTextAreaElement; t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px' }}
              className="w-full bg-[var(--color-bg)] border border-gray-700 rounded px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[var(--color-primary)] resize-none overflow-hidden min-h-[44px]" />
          </div>

          <button onClick={saveDetails} disabled={saving}
            className="mt-3 bg-[var(--color-primary)] text-white px-4 py-2.5 rounded text-sm flex items-center gap-1.5 hover:brightness-110 transition min-h-[44px]">
            <Save size={14} />Save Details
          </button>
        </div>

        {/* Services / line items — editable */}
        <div className="bg-[var(--color-surface)] rounded-lg p-4">
          <label className="block text-xs text-[var(--color-muted)] mb-3">Services / Line Items</label>

          {/* Add from catalog */}
          {services.length > 0 && (
            <ServiceSearch services={services} onSelect={addServiceFromCatalog} />
          )}

          {/* Custom service */}
          <div className="flex gap-2 mb-3">
            <input type="text" value={customDesc} onChange={(e) => setCustomDesc(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCustomService())}
              placeholder="Or type a custom service..."
              className="flex-1 bg-[var(--color-bg)] border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[var(--color-primary)] min-h-[44px]" />
            <button onClick={addCustomService}
              className="bg-[var(--color-bg)] border border-gray-700 rounded-lg px-3 py-2 text-[var(--color-muted)] hover:text-white hover:border-[var(--color-primary)] transition min-h-[44px] min-w-[44px] flex items-center justify-center">
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
                        <div key={idx} className="bg-[var(--color-bg)] rounded-lg px-3 py-3">
                          <div className="flex flex-col md:flex-row md:items-center gap-2">
                            <div className="flex-1 min-w-0">
                              <span className="text-white text-sm">{li.description}</span>
                            </div>
                            {hasMultipleVehicles && (
                              <select value={li.vehicle_id || ''} onChange={(e) => updateLineItem(idx, 'vehicle_id', e.target.value || null)}
                                className="bg-[var(--color-surface)] border border-gray-700 rounded px-2 py-2 text-xs text-white focus:outline-none focus:border-[var(--color-primary)] w-full md:max-w-[140px] min-h-[44px] md:min-h-0">
                                <option value="">No vehicle</option>
                                {vehicleList.map((v: any) => (
                                  <option key={v.id} value={v.id}>{v.year} {v.make} {v.model}</option>
                                ))}
                              </select>
                            )}
                            <div className="flex items-center gap-1 self-end md:self-auto">
                              <input type="number" min="1" value={li.quantity}
                                onChange={(e) => updateLineItem(idx, 'quantity', parseInt(e.target.value) || 1)}
                                className="w-14 bg-[var(--color-surface)] border border-gray-700 rounded px-2 py-2 text-xs text-white text-center focus:outline-none focus:border-[var(--color-primary)] min-h-[44px] md:min-h-0 md:py-1 md:w-12" />
                              <span className="text-xs text-[var(--color-muted)]">×$</span>
                              <input type="number" min="0" step="0.01" value={li.unit_price || ''}
                                onChange={(e) => updateLineItem(idx, 'unit_price', parseFloat(e.target.value) || 0)}
                                placeholder="0"
                                className="w-20 bg-[var(--color-surface)] border border-gray-700 rounded px-2 py-2 text-xs text-white text-right focus:outline-none focus:border-[var(--color-primary)] min-h-[44px] md:min-h-0 md:py-1 md:w-16" />
                            </div>
                            <button onClick={() => removeLineItem(idx)} className="text-gray-600 hover:text-red-400 min-h-[44px] min-w-[44px] flex items-center justify-center md:min-h-0 md:min-w-0"><X size={16} /></button>
                          </div>
                          <textarea value={li.notes || ''} onChange={(e) => updateLineItem(idx, 'notes', e.target.value || null)}
                            rows={li.notes ? Math.min(Math.max(li.notes.split('\n').length, 1), 6) : 1} placeholder="Notes / findings for this service..."
                            onInput={(e) => { const t = e.target as HTMLTextAreaElement; t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px' }}
                            className="w-full mt-1.5 bg-[var(--color-surface)] border border-gray-700 rounded px-2 py-2 text-xs text-[var(--color-muted)] focus:text-white focus:outline-none focus:border-[var(--color-primary)] resize-none overflow-hidden min-h-[44px] md:min-h-0 md:py-1" />
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
            className="mt-3 bg-[var(--color-primary)] text-white px-4 py-2.5 rounded text-sm flex items-center gap-1.5 hover:brightness-110 transition min-h-[44px]">
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
                className="px-4 py-2.5 rounded-lg text-sm text-[var(--color-muted)] hover:text-white transition min-h-[44px]">
                No, Keep It
              </button>
              <button onClick={handleDelete} disabled={deleting}
                className="bg-red-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-red-500 disabled:opacity-50 transition min-h-[44px]">
                {deleting ? 'Deleting...' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ServiceSearch({ services, onSelect }: {
  services: Service[]
  onSelect: (svc: Service) => void
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)

  const filtered = query.trim()
    ? services.filter(s => s.name.toLowerCase().includes(query.toLowerCase()))
    : services

  // Group filtered results by category
  const filteredByCategory: Record<string, Service[]> = {}
  filtered.forEach(s => {
    const cat = s.category || 'other'
    if (!filteredByCategory[cat]) filteredByCategory[cat] = []
    filteredByCategory[cat].push(s)
  })

  function handleSelect(svc: Service) {
    onSelect(svc)
    setQuery('')
    setOpen(false)
  }

  return (
    <div className="relative mb-3">
      <div className="relative z-30">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
        <input
          type="text"
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          placeholder="+ Add from canned services..."
          className="w-full bg-[var(--color-bg)] border border-gray-700 rounded-lg pl-9 pr-4 py-2 text-sm text-white focus:outline-none focus:border-[var(--color-primary)] min-h-[44px]"
        />
      </div>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute z-20 w-full mt-1 bg-[var(--color-surface)] border border-gray-700 rounded-lg shadow-lg max-h-64 overflow-y-auto">
            {Object.keys(filteredByCategory).length === 0 ? (
              <p className="text-[var(--color-muted)] text-xs px-3 py-4 text-center">No matching services</p>
            ) : (
              Object.entries(filteredByCategory).map(([cat, svcs]) => (
                <div key={cat}>
                  <div className="px-3 py-1.5 text-[10px] text-[var(--color-muted)] uppercase tracking-wider font-semibold bg-[var(--color-bg)] sticky top-0">
                    {CATEGORY_LABELS[cat] || cat}
                  </div>
                  {svcs.map(s => (
                    <button
                      key={s.id}
                      onClick={() => handleSelect(s)}
                      className="w-full text-left px-3 py-2.5 text-sm text-white hover:bg-white/5 flex items-center justify-between min-h-[44px]"
                    >
                      <span className="truncate">{s.name}</span>
                      {s.default_rate > 0 && (
                        <span className="text-[var(--color-muted)] text-xs ml-2 flex-shrink-0">${s.default_rate}</span>
                      )}
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  )
}
