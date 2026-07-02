import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Save, Trash2, X, Search, FileText, ExternalLink, AlertTriangle, Link2, Copy, Check, RefreshCw } from 'lucide-react'
import JobAttachments from '../components/JobAttachments'
import { supabase } from '../lib/supabase'
import { deleteJob, getJobLineItems, getJobVehicles, saveJobLineItems, saveJobVehicles, saveVehicle, getServices, getTeam, type Service } from '../lib/db'
import { toast } from '../components/Toast'

const STATUSES = ['in_progress', 'complete', 'invoiced', 'paid', 'cancelled']
const STATUS_LABELS: Record<string, string> = {
  in_progress: 'In Progress', complete: 'Complete',
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

  const [pendingRemoveIdx, setPendingRemoveIdx] = useState<number | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showAddVehicle, setShowAddVehicle] = useState(false)
  const [vinInput, setVinInput] = useState('')
  const [vinDecoding, setVinDecoding] = useState(false)
  const [manualVehicle, setManualVehicle] = useState({ year: '', make: '', model: '', engine: '' })
  const [showManualEntry, setShowManualEntry] = useState(false)
  const [addingVehicle, setAddingVehicle] = useState(false)
  const [pendingRemoveVehicle, setPendingRemoveVehicle] = useState<any>(null)
  const [removingVehicle, setRemovingVehicle] = useState(false)
  const [showUnsavedPrompt, setShowUnsavedPrompt] = useState(false)
  const [creatingInvoice, setCreatingInvoice] = useState(false)
  const [showInvoiceConfirm, setShowInvoiceConfirm] = useState(false)
  const [isInsurance, setIsInsurance] = useState(false)
  const [creatingEstimate, setCreatingEstimate] = useState(false)
  const [showPaymentDialog, setShowPaymentDialog] = useState(false)
  const [recordingPayment, setRecordingPayment] = useState(false)
  const [syncingToQB, setSyncingToQB] = useState(false)
  const [teamMembers, setTeamMembers] = useState<any[]>([])
  const [showTechPicker, setShowTechPicker] = useState(false)
  const [reassigning, setReassigning] = useState(false)
  const initialNotesRef = useRef('')
  const initialLineItemsRef = useRef<string>('')

  useEffect(() => { loadJob() }, [id])

  const isDirty = useCallback(() => {
    if (notes !== initialNotesRef.current) return true
    if (JSON.stringify(lineItems) !== initialLineItemsRef.current) return true
    return false
  }, [notes, lineItems])

  // Warn on browser refresh/close with unsaved changes
  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (isDirty()) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [isDirty])

  async function loadJob() {
    const { data, error } = await supabase.from('jobs')
      .select('*, customers(name, portal_token, customer_type, qb_balance)')
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
      initialNotesRef.current = data.internal_notes || ''
      setIsInsurance(data.is_insurance || false)
      try {
        const items = await getJobLineItems(data.id)
        setLineItems(items)
        initialLineItemsRef.current = JSON.stringify(items)
      } catch (_) {}
      try {
        const svcs = await getServices()
        setServices(svcs)
      } catch (_) {}
      try {
        const members = await getTeam()
        setTeamMembers(members)
      } catch (_) {}
    }
    setLoading(false)
  }

  async function reassignTech(memberId: string | null) {
    setReassigning(true)
    const { error } = await supabase.from('jobs').update({ assigned_to: memberId }).eq('id', id)
    if (error) {
      toast('Failed to reassign tech')
    } else {
      const member = teamMembers.find((m: any) => m.id === memberId)
      setJob({ ...job, assigned_to: memberId, team: member ? { name: member.name, color: member.color } : null })
      toast(member ? `Reassigned to ${member.name}` : 'Unassigned')
    }
    setReassigning(false)
    setShowTechPicker(false)
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
    initialNotesRef.current = notes
    setSaving(false)
    toast('Details saved ✓')
  }

  async function saveLineItems() {
    if (!id) return
    setSaving(true)
    try {
      await saveJobLineItems(id, lineItems)
      initialLineItemsRef.current = JSON.stringify(lineItems)
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

  async function removeVehicleFromJob(vehicleId: string) {
    if (!id) return
    setRemovingVehicle(true)
    try {
      const remainingIds = jobVehicles
        .map((jv: any) => jv.vehicles?.id)
        .filter((vid: string) => vid && vid !== vehicleId)
      await saveJobVehicles(id, remainingIds)
      // Clear vehicle_id on any line items linked to this vehicle
      setLineItems(prev => prev.map((li: any) =>
        li.vehicle_id === vehicleId ? { ...li, vehicle_id: null } : li
      ))
      // Update jobs.vehicle_id if needed
      await supabase.from('jobs').update({
        vehicle_id: remainingIds[0] || null
      }).eq('id', id)
      toast('Vehicle removed ✓')
      setPendingRemoveVehicle(null)
      loadJob()
    } catch (err) {
      console.error(err)
      toast('Failed to remove vehicle')
    }
    setRemovingVehicle(false)
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

  async function createInvoice() {
    if (!id) return
    setCreatingInvoice(true)
    setShowInvoiceConfirm(false)

    // Auto-save any unsaved line items and notes before sending to QB
    try {
      await saveJobLineItems(id, lineItems)
      initialLineItemsRef.current = JSON.stringify(lineItems)
      await supabase.from('jobs').update({ internal_notes: notes }).eq('id', id)
      initialNotesRef.current = notes
    } catch (err) {
      console.error('Auto-save before invoice failed:', err)
      toast('Failed to save changes before invoicing')
      setCreatingInvoice(false)
      return
    }
    try {
      // If insurance toggle is on, create estimate first
      if (isInsurance && !job.qb_estimate_id) {
        setCreatingEstimate(true)
        const estRes = await fetch('/.netlify/functions/qb-create-estimate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ job_id: id }),
        })
        const estData = await estRes.json()
        setCreatingEstimate(false)
        if (!estRes.ok) {
          toast(estData.error || 'Failed to create estimate')
          console.error('Estimate error:', estData)
          setCreatingInvoice(false)
          return
        }
        // Update local job state with estimate info
        setJob((prev: any) => ({ ...prev, qb_estimate_id: estData.estimate_id }))
      }

      // Save is_insurance flag to DB before creating invoice
      if (isInsurance) {
        await supabase.from('jobs').update({ is_insurance: true }).eq('id', id)
      }

      const res = await fetch('/.netlify/functions/qb-create-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: id, is_insurance: isInsurance }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast(data.error || 'Failed to create invoice')
        console.error('Invoice error:', data)
        setCreatingInvoice(false)
        return
      }
      // Update local state
      setJob((prev: any) => ({ ...prev, qb_invoice_id: data.invoice_id, invoice_number: data.invoice_number, status: 'invoiced' }))
      const msg = data.invoice_number ? `Invoice #${data.invoice_number} created ✓` : 'Invoice created ✓'
      const fullMsg = isInsurance ? `${msg} (with estimate + 20% discount)` : msg
      toast(data.skipped?.length ? `${fullMsg} (${data.skipped.length} line(s) skipped — no QB link)` : fullMsg)
      setShowPaymentDialog(true)
    } catch (err: any) {
      console.error(err)
      toast('Failed to create invoice')
    }
    setCreatingEstimate(false)
    setCreatingInvoice(false)
  }

  async function recordPayment(paymentMethod: 'cash' | 'check') {
    if (!id) return
    setRecordingPayment(true)
    try {
      const res = await fetch('/.netlify/functions/qb-record-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: id, payment_method: paymentMethod }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast(data.error || 'Failed to record payment')
        console.error('Payment error:', data)
        setRecordingPayment(false)
        return
      }
      setJob((prev: any) => ({ ...prev, payment_status: 'paid', payment_method: paymentMethod, status: 'paid' }))
      toast(`Payment recorded ✓ (${paymentMethod})`)
      setShowPaymentDialog(false)
    } catch (err: any) {
      console.error(err)
      toast('Failed to record payment')
    }
    setRecordingPayment(false)
  }

  async function syncToQB() {
    if (!id) return
    setSyncingToQB(true)
    try {
      const res = await fetch('/api/qb-update-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: id }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast(data.error || 'Failed to sync to QuickBooks')
        console.error('QB sync error:', data)
        setSyncingToQB(false)
        return
      }
      setJob((prev: any) => ({ ...prev, qb_invoice_total: data.total }))
      const msg = data.invoice_number ? `Invoice #${data.invoice_number} updated in QB ✓` : 'Invoice updated in QB ✓'
      toast(data.skipped?.length ? `${msg} (${data.skipped.length} line(s) skipped — no QB link)` : msg)
    } catch (err: any) {
      console.error(err)
      toast('Failed to sync to QuickBooks')
    }
    setSyncingToQB(false)
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
        <button onClick={() => isDirty() ? setShowUnsavedPrompt(true) : navigate('/jobs')} className="text-[var(--color-muted)] hover:text-white min-h-[44px] min-w-[44px] flex items-center justify-center"><ArrowLeft size={20} /></button>
        <div className="flex-1">
          <h1 className="text-xl font-bold">{job.customers?.name || 'Unknown Customer'}</h1>
          <p className="text-xs text-[var(--color-muted)]">
            {jobVehicles.length > 0
              ? jobVehicles.map((jv: any, i: number) => {
                  const v = jv.vehicles
                  return <span key={i} className="inline-flex items-center">
                    {i > 0 && ' · '}{v?.year} {v?.make} {v?.model}{v?.vin && <span className="ml-1 font-mono">({v.vin})</span>}
                    <button
                      onClick={(e) => { e.stopPropagation(); setPendingRemoveVehicle(v) }}
                      className="ml-1 text-gray-500 hover:text-red-400 transition inline-flex items-center justify-center"
                      title="Remove vehicle from job"
                    >
                      <X size={12} />
                    </button>
                  </span>
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

      {/* Past-due balance warning */}
      {job.customers?.qb_balance > 0 && (
        <div className="bg-red-900/30 border border-red-800 rounded-lg px-4 py-3 mb-4 flex items-center gap-3">
          <AlertTriangle size={18} className="text-red-400 flex-shrink-0" />
          <p className="text-sm text-red-300">
            This customer has an outstanding balance of <span className="text-white font-medium">${Number(job.customers.qb_balance).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </p>
        </div>
      )}

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

        {/* Invoice section */}
        {job.qb_invoice_id ? (
          <div className="space-y-2">
            {job.qb_estimate_id && (
              <div className="bg-blue-900/20 border border-blue-800 rounded-lg p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <FileText size={18} className="text-blue-400" />
                  <div>
                    <p className="text-sm text-white font-medium">Estimate Created</p>
                    <p className="text-xs text-blue-400/70">Insurance — Full price</p>
                  </div>
                </div>
                <a
                  href={`https://app.qbo.intuit.com/app/estimate?txnId=${job.qb_estimate_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-[var(--color-primary)] hover:underline min-h-[44px] px-2"
                >
                  View in QB <ExternalLink size={12} />
                </a>
              </div>
            )}
            <div className="bg-green-900/20 border border-green-800 rounded-lg p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileText size={18} className="text-green-400" />
                <div>
                  <p className="text-sm text-white font-medium">
                    Invoice {job.invoice_number ? `#${job.invoice_number}` : 'Created'}
                  </p>
                  <p className="text-xs text-green-400/70">
                    {job.qb_estimate_id ? 'Insurance — 20% discounted' : 'Sent to QuickBooks'}
                  </p>
                </div>
              </div>
              <a
                href={`https://app.qbo.intuit.com/app/invoice?txnId=${job.qb_invoice_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-[var(--color-primary)] hover:underline min-h-[44px] px-2"
              >
                View in QB <ExternalLink size={12} />
              </a>
            </div>
            {job.payment_status !== 'paid' && (
              <button
                onClick={syncToQB}
                disabled={syncingToQB}
                className="w-full flex items-center justify-center gap-2 bg-[var(--color-surface)] hover:bg-[var(--color-surface-hover)] border border-gray-700 disabled:opacity-50 text-white rounded-lg py-2.5 text-sm font-medium transition min-h-[44px]"
              >
                <RefreshCw size={14} className={syncingToQB ? 'animate-spin' : ''} />
                {syncingToQB ? 'Syncing to QuickBooks...' : 'Re-sync to QuickBooks'}
              </button>
            )}
          </div>
        ) : lineItems.length > 0 && job.status !== 'cancelled' ? (
          <div className="bg-[var(--color-surface)] rounded-lg p-4">
            {lineItems.some((li: any) => !li.qb_item_id) && (
              <div className="flex items-start gap-2 mb-3 text-xs text-yellow-400/80">
                <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                <span>
                  {lineItems.filter((li: any) => !li.qb_item_id).length} line item(s) have no QB link and will be skipped.
                  Use canned services from the catalog to ensure QB mapping.
                </span>
              </div>
            )}
            {/* Insurance toggle */}
            <label className="flex items-center gap-3 mb-3 cursor-pointer select-none">
              <div
                onClick={() => setIsInsurance(!isInsurance)}
                className={`relative w-10 h-6 rounded-full transition-colors ${isInsurance ? 'bg-blue-600' : 'bg-gray-600'}`}
              >
                <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${isInsurance ? 'translate-x-4' : ''}`} />
              </div>
              <div>
                <span className="text-sm text-white">Insurance Job</span>
                {isInsurance && (
                  <p className="text-xs text-blue-400/80 mt-0.5">
                    Creates estimate at full price + invoice with 20% discount
                  </p>
                )}
              </div>
            </label>
            <button
              onClick={() => setShowInvoiceConfirm(true)}
              disabled={creatingInvoice || !lineItems.some((li: any) => li.qb_item_id)}
              className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:hover:bg-green-600 text-white rounded-lg py-3 text-sm font-medium transition min-h-[44px]"
            >
              <FileText size={16} />
              {creatingEstimate ? 'Creating Estimate...' : creatingInvoice ? 'Creating Invoice...' : isInsurance ? 'Send Estimate + Invoice to QuickBooks' : 'Send Invoice to QuickBooks'}
            </button>
          </div>
        ) : null}

        {/* Share links */}
        <ShareLinks jobId={id!} portalToken={job.customers?.customer_type !== 'individual' ? job.customers?.portal_token : undefined} />

        {/* Job details */}
        <div className="bg-[var(--color-surface)] rounded-lg p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm mb-4">
            <div>
              <span className="text-xs text-[var(--color-muted)]">Job Type</span>
              <p className="text-white capitalize">{job.job_type}</p>
            </div>
            <div className="relative">
              <span className="text-xs text-[var(--color-muted)]">Assigned To</span>
              <button
                type="button"
                onClick={() => setShowTechPicker(!showTechPicker)}
                className="flex items-center gap-1 hover:opacity-80 transition-opacity cursor-pointer"
                disabled={reassigning}
              >
                <p style={{ color: job.team?.color || 'white' }}>{job.team?.name || 'Unassigned'}</p>
                <svg className="w-3 h-3 text-[var(--color-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </button>
              {showTechPicker && (
                <div className="absolute z-50 mt-1 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg shadow-lg min-w-[160px]">
                  {teamMembers.map((m: any) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => reassignTech(m.id)}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-[var(--color-surface)] transition-colors first:rounded-t-lg last:rounded-b-lg ${job.assigned_to === m.id ? 'bg-[var(--color-surface)]' : ''}`}
                      style={{ color: m.color || 'white' }}
                    >
                      {m.name} {job.assigned_to === m.id ? '✓' : ''}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => reassignTech(null)}
                    className="w-full text-left px-3 py-2 text-sm text-[var(--color-muted)] hover:bg-[var(--color-surface)] transition-colors border-t border-[var(--color-border)] last:rounded-b-lg"
                  >
                    Unassign
                  </button>
                </div>
              )}
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
                            <button onClick={() => setPendingRemoveIdx(idx)} className="text-gray-600 hover:text-red-400 min-h-[44px] min-w-[44px] flex items-center justify-center md:min-h-0 md:min-w-0"><X size={16} /></button>
                          </div>
                          <textarea value={li.notes || ''} onChange={(e) => updateLineItem(idx, 'notes', e.target.value || null)}
                            rows={li.notes ? Math.min(Math.max(li.notes.split('\n').length, 1), 6) : 1} placeholder="Notes / findings for this service..."
                            onInput={(e) => { const t = e.target as HTMLTextAreaElement; t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px' }}
                            onFocus={(e) => { const t = e.target as HTMLTextAreaElement; t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px' }}
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

        {/* Attachments */}
        <JobAttachments jobId={id!} vehicleVins={vehicleList.map((v: any) => v.vin).filter(Boolean)} />
      </div>

      {/* Unsaved changes prompt */}
      {showUnsavedPrompt && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setShowUnsavedPrompt(false)}>
          <div className="bg-[var(--color-surface)] rounded-lg p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-white font-medium mb-2">Unsaved Changes</h3>
            <p className="text-[var(--color-muted)] text-sm mb-4">You have unsaved changes. Are you sure you want to leave?</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowUnsavedPrompt(false)}
                className="px-4 py-2 rounded-lg text-sm text-[var(--color-muted)] hover:text-white transition min-h-[44px]">Stay</button>
              <button onClick={() => navigate('/jobs')}
                className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-500 transition min-h-[44px]">Leave</button>
            </div>
          </div>
        </div>
      )}

      {/* Remove line item confirmation */}
      {pendingRemoveIdx !== null && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setPendingRemoveIdx(null)}>
          <div className="bg-[var(--color-surface)] rounded-lg p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-white font-medium mb-2">Remove Service</h3>
            <p className="text-[var(--color-muted)] text-sm mb-4">Are you sure you want to remove <span className="text-white">{lineItems[pendingRemoveIdx]?.description}</span>?</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setPendingRemoveIdx(null)}
                className="px-4 py-2 rounded-lg text-sm text-[var(--color-muted)] hover:text-white transition min-h-[44px]">Cancel</button>
              <button onClick={() => { removeLineItem(pendingRemoveIdx); setPendingRemoveIdx(null) }}
                className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-500 transition min-h-[44px]">Yes, Remove</button>
            </div>
          </div>
        </div>
      )}

      {/* Remove vehicle confirmation modal */}
      {pendingRemoveVehicle && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setPendingRemoveVehicle(null)}>
          <div className="bg-[var(--color-surface)] rounded-lg p-6 max-w-sm w-full mx-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-white font-medium mb-2">Remove Vehicle?</h3>
            <p className="text-sm text-[var(--color-muted)] mb-4">
              Remove <span className="text-white">{pendingRemoveVehicle.year} {pendingRemoveVehicle.make} {pendingRemoveVehicle.model}</span> from this job?
              {pendingRemoveVehicle.vin && <span className="block font-mono text-xs mt-1">{pendingRemoveVehicle.vin}</span>}
              <span className="block mt-2">Any line items linked to this vehicle will be unlinked (not deleted).</span>
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setPendingRemoveVehicle(null)}
                className="px-4 py-2.5 rounded-lg text-sm text-[var(--color-muted)] hover:text-white transition min-h-[44px]">Cancel</button>
              <button onClick={() => removeVehicleFromJob(pendingRemoveVehicle.id)} disabled={removingVehicle}
                className="bg-red-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-red-500 disabled:opacity-50 transition min-h-[44px]">
                {removingVehicle ? 'Removing...' : 'Yes, Remove'}
              </button>
            </div>
          </div>
        </div>
      )}

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

      {/* Invoice confirmation modal */}
      {showInvoiceConfirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setShowInvoiceConfirm(false)}>
          <div className="bg-[var(--color-surface)] rounded-lg p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-white font-medium mb-2">
              {isInsurance ? 'Send Estimate + Invoice to QuickBooks?' : 'Send Invoice to QuickBooks?'}
            </h3>
            <p className="text-sm text-[var(--color-muted)] mb-2">
              {isInsurance
                ? <>This will create an <span className="text-white">estimate at full price</span> and an <span className="text-white">invoice with 20% discount</span> in QuickBooks for <span className="text-white">{job.customers?.name || 'Unknown'}</span>.</>
                : <>This will create an invoice in QuickBooks for <span className="text-white">{job.customers?.name || 'Unknown'}</span>.</>
              }
            </p>
            {isInsurance ? (
              <div className="text-sm mb-4">
                <p className="text-white font-medium">
                  Estimate: ${lineItems.reduce((sum: number, li: any) => sum + ((li.quantity || 1) * (li.unit_price || 0)), 0).toFixed(2)}
                </p>
                <p className="text-green-400 font-medium">
                  Invoice: ${(lineItems.reduce((sum: number, li: any) => sum + ((li.quantity || 1) * (li.unit_price || 0)), 0) * 0.8).toFixed(2)}
                  <span className="text-xs text-[var(--color-muted)] ml-1">(20% off)</span>
                </p>
              </div>
            ) : (
              <p className="text-sm text-white font-medium mb-4">
                Total: ${lineItems.reduce((sum: number, li: any) => sum + ((li.quantity || 1) * (li.unit_price || 0)), 0).toFixed(2)}
              </p>
            )}
            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowInvoiceConfirm(false)}
                className="px-4 py-2.5 rounded-lg text-sm text-[var(--color-muted)] hover:text-white transition min-h-[44px]">Cancel</button>
              <button onClick={createInvoice}
                className="bg-green-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-green-500 transition min-h-[44px]">
                {isInsurance ? 'Yes, Send Both' : 'Yes, Send Invoice'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payment on site dialog */}
      {showPaymentDialog && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setShowPaymentDialog(false)}>
          <div className="bg-[var(--color-surface)] rounded-lg p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-white font-medium mb-2">Was this job paid on site?</h3>
            <p className="text-sm text-[var(--color-muted)] mb-4">
              Select a payment method, or choose online payment to send the invoice link to the customer.
            </p>
            <div className="space-y-2">
              <button onClick={() => recordPayment('cash')} disabled={recordingPayment}
                className="w-full bg-green-600 text-white px-4 py-3 rounded-lg text-sm font-medium hover:bg-green-500 disabled:opacity-50 transition min-h-[44px]">
                {recordingPayment ? 'Recording...' : 'Cash'}
              </button>
              <button onClick={() => recordPayment('check')} disabled={recordingPayment}
                className="w-full bg-green-600 text-white px-4 py-3 rounded-lg text-sm font-medium hover:bg-green-500 disabled:opacity-50 transition min-h-[44px]">
                {recordingPayment ? 'Recording...' : 'Check'}
              </button>
              <button onClick={() => setShowPaymentDialog(false)} disabled={recordingPayment}
                className="w-full bg-[var(--color-bg)] text-[var(--color-muted)] px-4 py-3 rounded-lg text-sm font-medium hover:text-white transition min-h-[44px]">
                No — Online Payment
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

function ShareLinks({ jobId, portalToken }: { jobId: string; portalToken?: string }) {
  const [copiedJob, setCopiedJob] = useState(false)
  const [copiedPortal, setCopiedPortal] = useState(false)

  const jobUrl = `${window.location.origin}/j/${jobId}`
  const portalUrl = portalToken ? `${window.location.origin}/p/${portalToken}` : null

  function copyToClipboard(text: string, type: 'job' | 'portal') {
    navigator.clipboard.writeText(text)
    if (type === 'job') {
      setCopiedJob(true)
      setTimeout(() => setCopiedJob(false), 2000)
    } else {
      setCopiedPortal(true)
      setTimeout(() => setCopiedPortal(false), 2000)
    }
  }

  return (
    <div className="bg-[var(--color-surface)] rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3">
        <Link2 size={16} className="text-[var(--color-primary)]" />
        <span className="text-xs text-[var(--color-muted)] uppercase tracking-wider font-semibold">Customer Links</span>
      </div>
      <div className="space-y-2">
        <button
          onClick={() => copyToClipboard(jobUrl, 'job')}
          className="w-full flex items-center gap-3 bg-[var(--color-bg)] rounded-lg px-3 py-2.5 text-sm hover:brightness-110 transition text-left min-h-[44px]"
        >
          {copiedJob ? <Check size={16} className="text-green-400 flex-shrink-0" /> : <Copy size={16} className="text-[var(--color-muted)] flex-shrink-0" />}
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-medium">{copiedJob ? 'Copied!' : 'Copy Job Summary Link'}</p>
            <p className="text-[var(--color-muted)] text-xs truncate">{jobUrl}</p>
          </div>
        </button>
        {portalUrl && (
          <button
            onClick={() => copyToClipboard(portalUrl, 'portal')}
            className="w-full flex items-center gap-3 bg-[var(--color-bg)] rounded-lg px-3 py-2.5 text-sm hover:brightness-110 transition text-left min-h-[44px]"
          >
            {copiedPortal ? <Check size={16} className="text-green-400 flex-shrink-0" /> : <Copy size={16} className="text-[var(--color-muted)] flex-shrink-0" />}
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-medium">{copiedPortal ? 'Copied!' : 'Copy Customer Portal Link'}</p>
              <p className="text-[var(--color-muted)] text-xs truncate">{portalUrl}</p>
            </div>
          </button>
        )}
      </div>
    </div>
  )
}
