import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Save, Search, Plus, X } from 'lucide-react'
import { getCustomers, getTeam, saveJob, saveCustomer, saveVehicle, type Customer } from '../lib/db'

const JOB_TYPES = ['diagnostic', 'programming', 'adas', 'keys', 'other'] as const
const JOB_TYPE_LABELS: Record<string, string> = {
  diagnostic: 'Diagnostic', programming: 'Programming', adas: 'ADAS', keys: 'Keys', other: 'Other'
}

export default function NewJobPage() {
  const navigate = useNavigate()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [team, setTeam] = useState<any[]>([])
  const [customerSearch, setCustomerSearch] = useState('')
  const [showNewCustomer, setShowNewCustomer] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const [form, setForm] = useState({
    customer_id: '',
    job_type: 'diagnostic' as string,
    assigned_to: '',
    shop_name: '',
    shop_ro_number: '',
    job_description: '',
    scheduled_start: '',
    scheduled_end: '',
    internal_notes: '',
  })

  // Quick-add customer
  const [newCust, setNewCust] = useState({ name: '', phone: '', email: '' })
  const [newCustErrors, setNewCustErrors] = useState<Record<string, string>>({})

  // Services / line items
  const [lineItems, setLineItems] = useState<string[]>([])
  const [newItem, setNewItem] = useState('')

  // Vehicle
  const [vin, setVin] = useState('')
  const [vehicle, setVehicle] = useState({ year: '', make: '', model: '', engine: '' })

  const [saving, setSaving] = useState(false)

  useEffect(() => {
    getTeam().then(setTeam)
    loadCustomers()
  }, [])

  async function loadCustomers(search?: string) {
    const data = await getCustomers(search)
    setCustomers(data)
  }

  useEffect(() => {
    const t = setTimeout(() => loadCustomers(customerSearch), 300)
    return () => clearTimeout(t)
  }, [customerSearch])

  async function handleVinDecode() {
    if (vin.length !== 17) return
    try {
      const res = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/decodevin/${vin}?format=json`)
      const json = await res.json()
      const getVal = (name: string) => json.Results.find((r: any) => r.Variable === name)?.Value || ''
      setVehicle({ year: getVal('Model Year'), make: getVal('Make'), model: getVal('Model'), engine: getVal('Engine Model') })
    } catch (_) {}
  }

  function validate(): boolean {
    const e: Record<string, string> = {}
    if (showNewCustomer) {
      if (!newCust.name.trim()) newCustErrors.name = 'Required'
      if (!newCust.phone.trim()) newCustErrors.phone = 'Required'
      setNewCustErrors({ ...newCustErrors })
      if (Object.keys(newCustErrors).length > 0) return false
    } else {
      if (!form.customer_id) e.customer_id = 'Select a customer'
    }
    if (!form.job_type) e.job_type = 'Required'
    if (!form.assigned_to) e.assigned_to = 'Assign a tech'
    if (!form.scheduled_start) e.scheduled_start = 'Required'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSave() {
    if (!validate()) {
      console.log('Validation failed', errors)
      alert('Please fill in all required fields (marked with *)')
      return
    }
    setSaving(true)
    try {
      let custId = form.customer_id

      if (showNewCustomer) {
        console.log('Saving new customer...')
        const c = await saveCustomer({ ...newCust, customer_type: 'shop' })
        custId = c.id
      }

      let vehicleId = null
      if (vin.length === 17 && custId) {
        console.log('Saving vehicle...')
        const v = await saveVehicle({
          customer_id: custId, vin: vin.toUpperCase(),
          year: parseInt(vehicle.year) || null, make: vehicle.make, model: vehicle.model, engine: vehicle.engine,
        })
        vehicleId = v.id
      }

      console.log('Saving job...', { custId, vehicleId, job_type: form.job_type, assigned_to: form.assigned_to })
      let description = form.job_description || ''
      if (lineItems.length > 0) {
        description += (description ? '\n\n' : '') + 'Services:\n' + lineItems.map((s) => '• ' + s).join('\n')
      }

      await saveJob({
        customer_id: custId,
        vehicle_id: vehicleId,
        job_type: form.job_type as any,
        assigned_to: form.assigned_to || null,
        status: 'scheduled',
        shop_name: form.shop_name || null,
        shop_ro_number: form.shop_ro_number || null,
        problem_description: description || null,
        internal_notes: form.internal_notes || null,
        scheduled_start: new Date(form.scheduled_start).toISOString(),
        scheduled_end: form.scheduled_end ? new Date(form.scheduled_end).toISOString() : null,
      })

      navigate('/jobs')
    } catch (err: any) {
      console.error('Save failed:', err)
      alert('Failed to create job: ' + (err?.message || 'Unknown error'))
    }
    setSaving(false)
  }

  function addItem() {
    if (!newItem.trim()) return
    setLineItems([...lineItems, newItem.trim()])
    setNewItem('')
  }

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => navigate('/jobs')} className="text-[var(--color-muted)] hover:text-white"><ArrowLeft size={20} /></button>
        <h1 className="text-xl font-bold">New Job</h1>
        <div className="flex-1" />
        <button onClick={handleSave} disabled={saving}
          className="bg-[var(--color-primary)] text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 hover:brightness-110 disabled:opacity-50 transition">
          <Save size={16} />{saving ? 'Creating...' : 'Create Job'}
        </button>
      </div>

      <div className="bg-[var(--color-surface)] rounded-lg p-6 space-y-4">
        {/* Customer */}
        <div>
          <label className="block text-xs text-[var(--color-muted)] mb-1">Customer *</label>
          {!showNewCustomer ? (
            <div>
              <div className="relative mb-2">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input type="text" value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)}
                  placeholder="Search customers..." className={`w-full bg-[var(--color-bg)] border rounded-lg pl-9 pr-4 py-2 text-sm text-white focus:outline-none focus:border-[var(--color-primary)] ${errors.customer_id ? 'border-red-500' : 'border-gray-700'}`} />
              </div>
              <div className="max-h-32 overflow-y-auto space-y-0.5 mb-2">
                {customers.map((c) => (
                  <button key={c.id} onClick={() => setForm({ ...form, customer_id: c.id, shop_name: c.name })}
                    className={`w-full text-left px-3 py-1.5 rounded text-sm transition ${form.customer_id === c.id ? 'bg-[var(--color-primary)] text-white' : 'text-[var(--color-muted)] hover:bg-white/5'}`}>
                    {c.name} {c.phone && <span className="text-xs opacity-60">— {c.phone}</span>}
                  </button>
                ))}
              </div>
              <button onClick={() => setShowNewCustomer(true)} className="text-[var(--color-primary)] text-xs hover:underline">
                + New customer
              </button>
              {errors.customer_id && <p className="text-red-400 text-xs mt-1">{errors.customer_id}</p>}
            </div>
          ) : (
            <div className="space-y-2 p-3 bg-[var(--color-bg)] rounded-lg">
              <input type="text" value={newCust.name} onChange={(e) => setNewCust({ ...newCust, name: e.target.value })}
                placeholder="Shop name *" className="w-full bg-[var(--color-surface)] border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--color-primary)]" />
              <div className="grid grid-cols-2 gap-2">
                <input type="text" value={newCust.phone} onChange={(e) => setNewCust({ ...newCust, phone: e.target.value })}
                  placeholder="Phone *" className="bg-[var(--color-surface)] border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--color-primary)]" />
                <input type="text" value={newCust.email} onChange={(e) => setNewCust({ ...newCust, email: e.target.value })}
                  placeholder="Email" className="bg-[var(--color-surface)] border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--color-primary)]" />
              </div>
              <button onClick={() => setShowNewCustomer(false)} className="text-[var(--color-muted)] text-xs hover:text-white">← Back to search</button>
            </div>
          )}
        </div>

        {/* Job type + Tech (both required) */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Job Type *</label>
            <select value={form.job_type} onChange={(e) => setForm({ ...form, job_type: e.target.value })}
              className={`w-full bg-[var(--color-bg)] border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--color-primary)] ${errors.job_type ? 'border-red-500' : 'border-gray-700'}`}>
              <option value="">Select type...</option>
              {JOB_TYPES.map((t) => <option key={t} value={t}>{JOB_TYPE_LABELS[t]}</option>)}
            </select>
            {errors.job_type && <p className="text-red-400 text-xs mt-1">{errors.job_type}</p>}
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Assign Tech *</label>
            <select value={form.assigned_to} onChange={(e) => setForm({ ...form, assigned_to: e.target.value })}
              className={`w-full bg-[var(--color-bg)] border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--color-primary)] ${errors.assigned_to ? 'border-red-500' : 'border-gray-700'}`}>
              <option value="">Select tech...</option>
              {team.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            {errors.assigned_to && <p className="text-red-400 text-xs mt-1">{errors.assigned_to}</p>}
          </div>
        </div>

        {/* Vehicle VIN */}
        <div>
          <label className="block text-xs text-[var(--color-muted)] mb-1">Vehicle VIN</label>
          <input type="text" value={vin} onChange={(e) => { setVin(e.target.value.toUpperCase()); if (e.target.value.length === 17) handleVinDecode() }}
            maxLength={17} placeholder="17-character VIN" className="w-full bg-[var(--color-bg)] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-[var(--color-primary)]" />
          {vehicle.year && (
            <p className="text-xs text-[var(--color-muted)] mt-1">{vehicle.year} {vehicle.make} {vehicle.model}{vehicle.engine && ` — ${vehicle.engine}`}</p>
          )}
        </div>

        {/* Schedule */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Scheduled Start *</label>
            <input type="datetime-local" value={form.scheduled_start} onChange={(e) => setForm({ ...form, scheduled_start: e.target.value })}
              className={`w-full bg-[var(--color-bg)] border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--color-primary)] ${errors.scheduled_start ? 'border-red-500' : 'border-gray-700'}`} />
            {errors.scheduled_start && <p className="text-red-400 text-xs mt-1">{errors.scheduled_start}</p>}
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Scheduled End</label>
            <input type="datetime-local" value={form.scheduled_end} onChange={(e) => setForm({ ...form, scheduled_end: e.target.value })}
              className="w-full bg-[var(--color-bg)] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--color-primary)]" />
          </div>
        </div>

        {/* Shop / RO */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Shop Name</label>
            <input type="text" value={form.shop_name} onChange={(e) => setForm({ ...form, shop_name: e.target.value })}
              className="w-full bg-[var(--color-bg)] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--color-primary)]" />
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Shop RO #</label>
            <input type="text" value={form.shop_ro_number} onChange={(e) => setForm({ ...form, shop_ro_number: e.target.value })}
              className="w-full bg-[var(--color-bg)] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--color-primary)]" />
          </div>
        </div>

        {/* Job description */}
        <div>
          <label className="block text-xs text-[var(--color-muted)] mb-1">Job Description</label>
          <textarea value={form.job_description} onChange={(e) => setForm({ ...form, job_description: e.target.value })}
            rows={2} placeholder="What needs to be done?"
            className="w-full bg-[var(--color-bg)] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--color-primary)] resize-none" />
        </div>

        {/* Services / line items */}
        <div>
          <label className="block text-xs text-[var(--color-muted)] mb-1">Services</label>
          <div className="flex gap-2 mb-2">
            <input type="text" value={newItem} onChange={(e) => setNewItem(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addItem())}
              placeholder="e.g. GM module programming, Front radar calibration"
              className="flex-1 bg-[var(--color-bg)] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--color-primary)]" />
            <button onClick={addItem}
              className="bg-[var(--color-bg)] border border-gray-700 rounded-lg px-3 py-2 text-[var(--color-muted)] hover:text-white hover:border-[var(--color-primary)] transition">
              <Plus size={16} />
            </button>
          </div>
          {lineItems.length > 0 && (
            <div className="space-y-1">
              {lineItems.map((item, i) => (
                <div key={i} className="flex items-center gap-2 bg-[var(--color-bg)] rounded px-3 py-1.5">
                  <span className="text-white text-sm flex-1">{item}</span>
                  <button onClick={() => setLineItems(lineItems.filter((_, j) => j !== i))}
                    className="text-gray-600 hover:text-red-400"><X size={14} /></button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Internal notes */}
        <div>
          <label className="block text-xs text-[var(--color-muted)] mb-1">Internal Notes</label>
          <textarea value={form.internal_notes} onChange={(e) => setForm({ ...form, internal_notes: e.target.value })}
            rows={2} placeholder="Notes for the tech..." className="w-full bg-[var(--color-bg)] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--color-primary)] resize-none" />
        </div>
      </div>
    </div>
  )
}
