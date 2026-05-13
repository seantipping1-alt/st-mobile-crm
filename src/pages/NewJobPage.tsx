import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Save, Search } from 'lucide-react'
import { getCustomers, getTeam, saveJob, saveCustomer, saveVehicle, type Customer } from '../lib/db'

const JOB_TYPES = ['diagnostic', 'programming', 'adas', 'keys', 'other'] as const

export default function NewJobPage() {
  const navigate = useNavigate()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [team, setTeam] = useState<any[]>([])
  const [customerSearch, setCustomerSearch] = useState('')
  const [showNewCustomer, setShowNewCustomer] = useState(false)

  const [form, setForm] = useState({
    customer_id: '',
    job_type: 'diagnostic' as string,
    assigned_to: '',
    priority: 'normal' as string,
    shop_name: '',
    shop_ro_number: '',
    problem_description: '',
    diagnostic_codes: '',
    scheduled_start: '',
    scheduled_end: '',
    internal_notes: '',
  })

  // Quick-add customer form
  const [newCust, setNewCust] = useState({ name: '', phone: '', email: '' })

  const [saving, setSaving] = useState(false)

  // Vehicle info
  const [vin, setVin] = useState('')
  const [vehicle, setVehicle] = useState({ year: '', make: '', model: '', engine: '' })

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
      setVehicle({
        year: getVal('Model Year'),
        make: getVal('Make'),
        model: getVal('Model'),
        engine: getVal('Engine Model'),
      })
    } catch (_) {}
  }

  async function handleSave() {
    if (!form.customer_id && !showNewCustomer) return alert('Select or create a customer')
    if (!form.scheduled_start) return alert('Schedule date is required')

    setSaving(true)
    try {
      let custId = form.customer_id

      // Quick-add customer
      if (showNewCustomer && newCust.name) {
        const c = await saveCustomer({ ...newCust, customer_type: 'shop' })
        custId = c.id
      }

      // Save vehicle if VIN provided
      let vehicleId = null
      if (vin.length === 17 && custId) {
        const v = await saveVehicle({
          customer_id: custId,
          vin: vin.toUpperCase(),
          year: parseInt(vehicle.year) || null,
          make: vehicle.make,
          model: vehicle.model,
          engine: vehicle.engine,
        })
        vehicleId = v.id
      }

      const codes = form.diagnostic_codes
        ? form.diagnostic_codes.split(/[,;\s]+/).filter(Boolean).map((c) => c.toUpperCase())
        : null

      await saveJob({
        customer_id: custId,
        vehicle_id: vehicleId,
        job_type: form.job_type as any,
        assigned_to: form.assigned_to || null,
        priority: form.priority as any,
        status: 'scheduled',
        shop_name: form.shop_name || null,
        shop_ro_number: form.shop_ro_number || null,
        problem_description: form.problem_description || null,
        diagnostic_codes: codes,
        internal_notes: form.internal_notes || null,
        scheduled_start: form.scheduled_start ? new Date(form.scheduled_start).toISOString() : null,
        scheduled_end: form.scheduled_end ? new Date(form.scheduled_end).toISOString() : null,
      })

      navigate('/jobs')
    } catch (err) {
      console.error(err)
      alert('Failed to create job')
    }
    setSaving(false)
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
          <label className="block text-xs text-[var(--color-muted)] mb-1">Customer</label>
          {!showNewCustomer ? (
            <div>
              <div className="relative mb-2">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input type="text" value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)}
                  placeholder="Search customers..." className="w-full bg-[var(--color-bg)] border border-gray-700 rounded-lg pl-9 pr-4 py-2 text-sm text-white focus:outline-none focus:border-[var(--color-primary)]" />
              </div>
              <div className="max-h-32 overflow-y-auto space-y-0.5 mb-2">
                {customers.map((c) => (
                  <button key={c.id} onClick={() => setForm({ ...form, customer_id: c.id, shop_name: c.name })}
                    className={`w-full text-left px-3 py-1.5 rounded text-sm transition ${form.customer_id === c.id ? 'bg-[var(--color-primary)] text-white' : 'text-[var(--color-muted)] hover:bg-white/5'}`}>
                    {c.name} {c.phone && <span className="text-xs opacity-60">— {c.phone}</span>}
                  </button>
                ))}
              </div>
              <button onClick={() => setShowNewCustomer(true)}
                className="text-[var(--color-primary)] text-xs hover:underline">+ Quick-add new customer</button>
            </div>
          ) : (
            <div className="space-y-2">
              <input type="text" value={newCust.name} onChange={(e) => setNewCust({ ...newCust, name: e.target.value })}
                placeholder="Shop name *" className="w-full bg-[var(--color-bg)] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--color-primary)]" />
              <div className="grid grid-cols-2 gap-2">
                <input type="text" value={newCust.phone} onChange={(e) => setNewCust({ ...newCust, phone: e.target.value })}
                  placeholder="Phone" className="bg-[var(--color-bg)] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--color-primary)]" />
                <input type="text" value={newCust.email} onChange={(e) => setNewCust({ ...newCust, email: e.target.value })}
                  placeholder="Email" className="bg-[var(--color-bg)] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--color-primary)]" />
              </div>
              <button onClick={() => setShowNewCustomer(false)} className="text-[var(--color-muted)] text-xs hover:text-white">
                ← Back to search
              </button>
            </div>
          )}
        </div>

        {/* Vehicle VIN */}
        <div>
          <label className="block text-xs text-[var(--color-muted)] mb-1">Vehicle VIN</label>
          <input type="text" value={vin} onChange={(e) => { setVin(e.target.value.toUpperCase()); if (e.target.value.length === 17) handleVinDecode() }}
            maxLength={17} placeholder="17-character VIN" className="w-full bg-[var(--color-bg)] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-[var(--color-primary)]" />
          {vehicle.year && (
            <p className="text-xs text-[var(--color-muted)] mt-1">
              {vehicle.year} {vehicle.make} {vehicle.model} {vehicle.engine && `— ${vehicle.engine}`}
            </p>
          )}
        </div>

        {/* Job type + Priority */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Job Type</label>
            <select value={form.job_type} onChange={(e) => setForm({ ...form, job_type: e.target.value })}
              className="w-full bg-[var(--color-bg)] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--color-primary)]">
              {JOB_TYPES.map((t) => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Priority</label>
            <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}
              className="w-full bg-[var(--color-bg)] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--color-primary)]">
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>
        </div>

        {/* Tech assignment */}
        <div>
          <label className="block text-xs text-[var(--color-muted)] mb-1">Assign Tech</label>
          <select value={form.assigned_to} onChange={(e) => setForm({ ...form, assigned_to: e.target.value })}
            className="w-full bg-[var(--color-bg)] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--color-primary)]">
            <option value="">Unassigned</option>
            {team.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>

        {/* Schedule */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Scheduled Start *</label>
            <input type="datetime-local" value={form.scheduled_start} onChange={(e) => setForm({ ...form, scheduled_start: e.target.value })}
              className="w-full bg-[var(--color-bg)] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--color-primary)]" />
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

        {/* Problem description */}
        <div>
          <label className="block text-xs text-[var(--color-muted)] mb-1">Problem Description</label>
          <textarea value={form.problem_description} onChange={(e) => setForm({ ...form, problem_description: e.target.value })}
            rows={2} placeholder="What's the customer reporting?"
            className="w-full bg-[var(--color-bg)] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--color-primary)] resize-none" />
        </div>

        {/* Diagnostic codes */}
        <div>
          <label className="block text-xs text-[var(--color-muted)] mb-1">Diagnostic Codes</label>
          <input type="text" value={form.diagnostic_codes} onChange={(e) => setForm({ ...form, diagnostic_codes: e.target.value })}
            placeholder="P0300, U0100 (comma or space separated)"
            className="w-full bg-[var(--color-bg)] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-[var(--color-primary)]" />
        </div>

        {/* Internal notes */}
        <div>
          <label className="block text-xs text-[var(--color-muted)] mb-1">Internal Notes</label>
          <textarea value={form.internal_notes} onChange={(e) => setForm({ ...form, internal_notes: e.target.value })}
            rows={2} placeholder="Notes for the tech..."
            className="w-full bg-[var(--color-bg)] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--color-primary)] resize-none" />
        </div>
      </div>
    </div>
  )
}
