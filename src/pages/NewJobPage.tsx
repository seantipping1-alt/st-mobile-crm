import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Save, Search, Plus, X } from 'lucide-react'
import { getCustomers, getTeam, getServices, saveJob, saveJobLineItems, saveJobVehicles, saveCustomer, saveVehicle, checkDuplicateCustomer, type Customer, type Service } from '../lib/db'
import { toast } from '../components/Toast'

const JOB_TYPES = ['diagnostic', 'programming', 'adas', 'keys', 'other'] as const
const JOB_TYPE_LABELS: Record<string, string> = {
  diagnostic: 'Diagnostic', programming: 'Programming', adas: 'ADAS', keys: 'Keys', other: 'Other'
}
const CATEGORY_LABELS: Record<string, string> = {
  diagnostic: 'Diagnostic', programming: 'Programming', adas: 'ADAS', keys: 'Keys', other: 'Other'
}

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA',
  'ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK',
  'OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'
]

interface LineItem {
  service_id: string | null
  vehicle_id: string | null
  description: string
  quantity: number
  unit_price: number
  category: string | null
  qb_item_id: string | null
  notes: string | null
}

interface VehicleEntry {
  localId: string
  vin: string
  year: string
  make: string
  model: string
  engine: string
  decoding: boolean
  decoded: boolean
  manual: boolean
}

export default function NewJobPage() {
  const navigate = useNavigate()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [team, setTeam] = useState<any[]>([])
  const [services, setServices] = useState<Service[]>([])
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
    scheduled_date: '',
    internal_notes: '',
  })

  const [newCust, setNewCust] = useState({
    name: '',
    customer_type: 'shop' as 'shop' | 'individual',
    primary_contact_name: '',
    phone: '',
    email: '',
    address_street: '',
    address_city: '',
    address_state: '',
    address_zip: '',
  })
  const [newCustErrors, setNewCustErrors] = useState<Record<string, string>>({})

  const [lineItems, setLineItems] = useState<LineItem[]>([])
  const [customDesc, setCustomDesc] = useState('')

  // Multiple vehicles
  const [vehicles, setVehicles] = useState<VehicleEntry[]>([])
  const [vinInput, setVinInput] = useState('')
  const [showManualVehicle, setShowManualVehicle] = useState(false)
  const [manualVehicle, setManualVehicle] = useState({ year: '', make: '', model: '', engine: '' })
  const [newCustDupes, setNewCustDupes] = useState<{ type: string; customer: Customer }[]>([])

  const [saving, setSaving] = useState(false)

  useEffect(() => {
    getTeam().then(setTeam)
    getServices().then(setServices).catch(() => {})
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

  // Duplicate detection for quick-add customer
  useEffect(() => {
    if (!showNewCustomer) { setNewCustDupes([]); return }
    const t = setTimeout(async () => {
      const matches = await checkDuplicateCustomer(newCust.phone || '', newCust.name || '')
      setNewCustDupes(matches)
    }, 500)
    return () => clearTimeout(t)
  }, [newCust.phone, newCust.name, showNewCustomer])

  async function decodeAndAddVin(vinValue: string) {
    const v = vinValue.toUpperCase().trim()
    if (v.length !== 17) return
    if (vehicles.some((ve) => ve.vin === v)) return // already added

    const lid = `vin-${v}`
    const entry: VehicleEntry = { localId: lid, vin: v, year: '', make: '', model: '', engine: '', decoding: true, decoded: false, manual: false }
    setVehicles((prev) => [...prev, entry])
    setVinInput('')

    try {
      const res = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/decodevin/${v}?format=json`)
      const json = await res.json()
      const getVal = (name: string) => json.Results.find((r: any) => r.Variable === name)?.Value || ''
      setVehicles((prev) => prev.map((ve) => ve.localId === lid
        ? { ...ve, year: getVal('Model Year'), make: getVal('Make'), model: getVal('Model'), engine: getVal('Engine Model'), decoding: false, decoded: true }
        : ve
      ))
    } catch (_) {
      setVehicles((prev) => prev.map((ve) => ve.localId === lid ? { ...ve, decoding: false } : ve))
    }
  }

  function addManualVehicle() {
    if (!manualVehicle.make.trim()) return
    const lid = `manual-${Date.now()}`
    setVehicles([...vehicles, {
      localId: lid, vin: '', year: manualVehicle.year, make: manualVehicle.make.trim(),
      model: manualVehicle.model.trim(), engine: manualVehicle.engine.trim(),
      decoding: false, decoded: true, manual: true,
    }])
    setManualVehicle({ year: '', make: '', model: '', engine: '' })
    setShowManualVehicle(false)
  }

  function removeVehicle(localId: string) {
    setVehicles(vehicles.filter((v) => v.localId !== localId))
  }

  function addService(service: Service) {
    setLineItems([...lineItems, {
      service_id: service.id,
      vehicle_id: null,
      description: service.name,
      quantity: 1,
      unit_price: service.default_rate || 0,
      category: 'labor',
      qb_item_id: service.qb_item_id,
      notes: service.default_notes || null,
    }])
  }

  function addCustomItem() {
    if (!customDesc.trim()) return
    setLineItems([...lineItems, {
      service_id: null,
      vehicle_id: null,
      description: customDesc.trim(),
      quantity: 1,
      unit_price: 0,
      category: 'labor',
      qb_item_id: null,
      notes: null,
    }])
    setCustomDesc('')
  }

  function removeLineItem(index: number) {
    setLineItems(lineItems.filter((_, i) => i !== index))
  }

  function updateLineItem(index: number, field: keyof LineItem, value: any) {
    setLineItems(lineItems.map((li, i) => i === index ? { ...li, [field]: value } : li))
  }

  function validate(): boolean {
    const e: Record<string, string> = {}
    if (showNewCustomer) {
      const ce: Record<string, string> = {}
      const isShop = newCust.customer_type === 'shop'
      if (!newCust.name.trim()) ce.name = 'Required'
      if (!newCust.phone.trim()) ce.phone = 'Required'
      if (!newCust.email.trim()) ce.email = 'Required'
      if (isShop) {
        if (!newCust.address_street.trim()) ce.address_street = 'Required'
        if (!newCust.address_city.trim()) ce.address_city = 'Required'
        if (!newCust.address_state) ce.address_state = 'Required'
        if (!newCust.address_zip.trim()) ce.address_zip = 'Required'
      }
      setNewCustErrors(ce)
      if (Object.keys(ce).length > 0) return false
    } else {
      if (!form.customer_id) e.customer_id = 'Select a customer'
    }
    if (!form.job_type) e.job_type = 'Required'
    if (!form.assigned_to) e.assigned_to = 'Assign a tech'
    if (!form.scheduled_date) e.scheduled_date = 'Required'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSave() {
    if (!validate()) return
    setSaving(true)
    try {
      let custId = form.customer_id

      if (showNewCustomer) {
        const c = await saveCustomer({
          name: newCust.name,
          customer_type: newCust.customer_type,
          primary_contact_name: newCust.primary_contact_name || null,
          phone: newCust.phone,
          email: newCust.email,
          address_street: newCust.address_street || null,
          address_city: newCust.address_city || null,
          address_state: newCust.address_state || null,
          address_zip: newCust.address_zip || null,
        })
        custId = c.id
      }

      // Save all vehicles and build localId→ID map
      const vehicleIds: string[] = []
      const localIdToDbId: Record<string, string> = {}
      for (const ve of vehicles) {
        if (!custId) continue
        if (ve.vin && ve.vin.length !== 17) continue
        let vYear = ve.year, vMake = ve.make, vModel = ve.model, vEngine = ve.engine
        if (ve.vin && !vYear && !vMake && !vModel) {
          try {
            const res = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/decodevin/${ve.vin}?format=json`)
            const json = await res.json()
            const getVal = (name: string) => json.Results.find((r: any) => r.Variable === name)?.Value || ''
            vYear = getVal('Model Year'); vMake = getVal('Make'); vModel = getVal('Model'); vEngine = getVal('Engine Model')
          } catch (_) {}
        }
        const saved = await saveVehicle({
          customer_id: custId, vin: ve.vin || null,
          year: parseInt(vYear) || null, make: vMake || null, model: vModel || null, engine: vEngine || null,
        })
        vehicleIds.push(saved.id)
        localIdToDbId[ve.localId] = saved.id
      }

      // Use first vehicle as the legacy vehicle_id
      const job = await saveJob({
        customer_id: custId,
        vehicle_id: vehicleIds[0] || null,
        job_type: form.job_type as any,
        assigned_to: form.assigned_to || null,
        status: 'scheduled',
        shop_name: form.shop_name || null,
        shop_ro_number: form.shop_ro_number || null,
        problem_description: form.job_description || null,
        internal_notes: form.internal_notes || null,
        scheduled_start: new Date(form.scheduled_date).toISOString(),
      })

      // Save vehicle junction
      if (vehicleIds.length > 0) {
        await saveJobVehicles(job.id, vehicleIds)
      }

      // Save line items with resolved vehicle IDs
      if (lineItems.length > 0) {
        const resolvedItems = lineItems.map((li) => ({
          ...li,
          vehicle_id: li.vehicle_id ? (localIdToDbId[li.vehicle_id] || li.vehicle_id) : (vehicleIds.length === 1 ? vehicleIds[0] : null),
        }))
        await saveJobLineItems(job.id, resolvedItems)
      }

      toast('Job created ✓')
      navigate('/jobs')
    } catch (err: any) {
      console.error('Save failed:', err)
      alert('Failed to create job: ' + (err?.message || 'Unknown error'))
    }
    setSaving(false)
  }

  function setNewCustField(field: string, value: any) {
    setNewCust((prev) => ({ ...prev, [field]: value }))
    if (newCustErrors[field]) setNewCustErrors((prev) => { const n = { ...prev }; delete n[field]; return n })
  }

  const isShop = newCust.customer_type === 'shop'

  const servicesByCategory: Record<string, Service[]> = {}
  services.forEach((s) => {
    const cat = s.category || 'other'
    if (!servicesByCategory[cat]) servicesByCategory[cat] = []
    servicesByCategory[cat].push(s)
  })

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
              <button onClick={() => setShowNewCustomer(true)} className="text-[var(--color-primary)] text-xs hover:underline">+ New customer</button>
              {errors.customer_id && <p className="text-red-400 text-xs mt-1">{errors.customer_id}</p>}
            </div>
          ) : (
            <div className="space-y-3 p-4 bg-[var(--color-bg)] rounded-lg">
              <div className="flex gap-2">
                {(['shop', 'individual'] as const).map((t) => (
                  <button key={t} onClick={() => setNewCustField('customer_type', t)}
                    className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${newCust.customer_type === t ? 'bg-[var(--color-primary)] text-white' : 'bg-[var(--color-surface)] text-[var(--color-muted)] hover:text-white'}`}>
                    {t === 'shop' ? 'Repair Shop' : 'Individual'}
                  </button>
                ))}
              </div>
              <div>
                <input type="text" value={newCust.name} onChange={(e) => setNewCustField('name', e.target.value)}
                  placeholder={isShop ? 'Shop name *' : 'Full name *'}
                  className={`w-full bg-[var(--color-surface)] border rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--color-primary)] ${newCustErrors.name ? 'border-red-500' : 'border-gray-700'}`} />
                {newCustErrors.name && <p className="text-red-400 text-xs mt-1">{newCustErrors.name}</p>}
              </div>
              {isShop && (
                <input type="text" value={newCust.primary_contact_name} onChange={(e) => setNewCustField('primary_contact_name', e.target.value)}
                  placeholder="Primary contact name"
                  className="w-full bg-[var(--color-surface)] border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--color-primary)]" />
              )}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <input type="text" value={newCust.phone} onChange={(e) => setNewCustField('phone', e.target.value)} placeholder="Phone *"
                    className={`w-full bg-[var(--color-surface)] border rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--color-primary)] ${newCustErrors.phone ? 'border-red-500' : 'border-gray-700'}`} />
                  {newCustErrors.phone && <p className="text-red-400 text-xs mt-1">{newCustErrors.phone}</p>}
                </div>
                <div>
                  <input type="text" value={newCust.email} onChange={(e) => setNewCustField('email', e.target.value)} placeholder="Email *"
                    className={`w-full bg-[var(--color-surface)] border rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--color-primary)] ${newCustErrors.email ? 'border-red-500' : 'border-gray-700'}`} />
                  {newCustErrors.email && <p className="text-red-400 text-xs mt-1">{newCustErrors.email}</p>}
                </div>
              </div>
              <div>
                <label className="block text-xs text-[var(--color-muted)] mb-1">Address {isShop ? '*' : '(optional)'}</label>
                <input type="text" value={newCust.address_street} onChange={(e) => setNewCustField('address_street', e.target.value)} placeholder="Street address"
                  className={`w-full bg-[var(--color-surface)] border rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--color-primary)] mb-2 ${newCustErrors.address_street ? 'border-red-500' : 'border-gray-700'}`} />
                {newCustErrors.address_street && <p className="text-red-400 text-xs mb-1">{newCustErrors.address_street}</p>}
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <input type="text" value={newCust.address_city} onChange={(e) => setNewCustField('address_city', e.target.value)} placeholder="City"
                      className={`w-full bg-[var(--color-surface)] border rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--color-primary)] ${newCustErrors.address_city ? 'border-red-500' : 'border-gray-700'}`} />
                    {newCustErrors.address_city && <p className="text-red-400 text-xs mt-1">{newCustErrors.address_city}</p>}
                  </div>
                  <div>
                    <select value={newCust.address_state} onChange={(e) => setNewCustField('address_state', e.target.value)}
                      className={`w-full bg-[var(--color-surface)] border rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--color-primary)] ${newCustErrors.address_state ? 'border-red-500' : 'border-gray-700'}`}>
                      <option value="">State</option>
                      {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                    {newCustErrors.address_state && <p className="text-red-400 text-xs mt-1">{newCustErrors.address_state}</p>}
                  </div>
                  <div>
                    <input type="text" value={newCust.address_zip} onChange={(e) => setNewCustField('address_zip', e.target.value)} placeholder="ZIP"
                      className={`w-full bg-[var(--color-surface)] border rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--color-primary)] ${newCustErrors.address_zip ? 'border-red-500' : 'border-gray-700'}`} />
                    {newCustErrors.address_zip && <p className="text-red-400 text-xs mt-1">{newCustErrors.address_zip}</p>}
                  </div>
                </div>
              </div>
              <button onClick={() => { setShowNewCustomer(false); setNewCustErrors({}); setNewCustDupes([]) }} className="text-[var(--color-muted)] text-xs hover:text-white">← Back to search</button>

              {/* Duplicate warning */}
              {newCustDupes.length > 0 && (
                <div className="bg-yellow-900/30 border border-yellow-700 rounded p-3">
                  <p className="text-yellow-300 text-xs font-medium mb-1">⚠ Possible duplicate</p>
                  {newCustDupes.map((dw, i) => (
                    <div key={i} className="flex items-center justify-between text-xs py-1">
                      <span className="text-white">{dw.customer.name} <span className="text-[var(--color-muted)]">({dw.type === 'phone' ? dw.customer.phone : 'similar name'})</span></span>
                      <button onClick={() => { setForm({ ...form, customer_id: dw.customer.id, shop_name: dw.customer.name }); setShowNewCustomer(false); setNewCustDupes([]) }}
                        className="text-[var(--color-primary)] hover:underline ml-2">Use this</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Job type + Tech */}
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

        {/* Vehicles — VIN or manual entry */}
        <div>
          <label className="block text-xs text-[var(--color-muted)] mb-1">Vehicles</label>
          <div className="flex gap-2 mb-2">
            <input type="text" value={vinInput} onChange={(e) => {
              const v = e.target.value.toUpperCase()
              setVinInput(v)
              if (v.length === 17) decodeAndAddVin(v)
            }}
              maxLength={17} placeholder="Enter VIN and it auto-decodes"
              className="flex-1 bg-[var(--color-bg)] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-[var(--color-primary)]" />
            <button onClick={() => { if (vinInput.length === 17) decodeAndAddVin(vinInput) }}
              className="bg-[var(--color-bg)] border border-gray-700 rounded-lg px-3 py-2 text-[var(--color-muted)] hover:text-white hover:border-[var(--color-primary)] transition">
              <Plus size={16} />
            </button>
          </div>
          {!showManualVehicle ? (
            <button onClick={() => setShowManualVehicle(true)}
              className="text-[var(--color-primary)] text-xs hover:underline mb-2">Don't have the VIN? Enter manually</button>
          ) : (
            <div className="bg-[var(--color-bg)] rounded-lg p-3 mb-2 space-y-2">
              <div className="grid grid-cols-4 gap-2">
                <input type="text" value={manualVehicle.year} onChange={(e) => setManualVehicle({ ...manualVehicle, year: e.target.value })}
                  placeholder="Year" maxLength={4}
                  className="bg-[var(--color-surface)] border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--color-primary)]" />
                <input type="text" value={manualVehicle.make} onChange={(e) => setManualVehicle({ ...manualVehicle, make: e.target.value })}
                  placeholder="Make *"
                  className="bg-[var(--color-surface)] border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--color-primary)]" />
                <input type="text" value={manualVehicle.model} onChange={(e) => setManualVehicle({ ...manualVehicle, model: e.target.value })}
                  placeholder="Model"
                  className="bg-[var(--color-surface)] border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--color-primary)]" />
                <input type="text" value={manualVehicle.engine} onChange={(e) => setManualVehicle({ ...manualVehicle, engine: e.target.value })}
                  placeholder="Engine"
                  className="bg-[var(--color-surface)] border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--color-primary)]" />
              </div>
              <div className="flex gap-2">
                <button onClick={addManualVehicle} disabled={!manualVehicle.make.trim()}
                  className="bg-[var(--color-primary)] text-white px-3 py-1.5 rounded text-sm hover:brightness-110 disabled:opacity-50 transition">
                  Add Vehicle
                </button>
                <button onClick={() => { setShowManualVehicle(false); setManualVehicle({ year: '', make: '', model: '', engine: '' }) }}
                  className="text-[var(--color-muted)] text-xs hover:text-white">Cancel</button>
              </div>
            </div>
          )}
          {vehicles.length > 0 && (
            <div className="space-y-1">
              {vehicles.map((ve) => (
                <div key={ve.localId} className="flex items-center gap-2 bg-[var(--color-bg)] rounded-lg px-3 py-2">
                  <div className="flex-1">
                    {ve.decoding ? (
                      <span className="text-xs text-[var(--color-muted)]">Decoding {ve.vin}...</span>
                    ) : ve.decoded ? (
                      <span className="text-sm text-green-400">✓ {ve.year} {ve.make} {ve.model}{ve.engine && ` — ${ve.engine}`}</span>
                    ) : (
                      <span className="text-sm text-white font-mono">{ve.vin || 'Unknown'}</span>
                    )}
                    {ve.vin && ve.decoded && <span className="text-xs text-[var(--color-muted)] ml-2 font-mono">{ve.vin}</span>}
                    {ve.manual && !ve.vin && <span className="text-xs text-yellow-500 ml-2">(no VIN)</span>}
                  </div>
                  <button onClick={() => removeVehicle(ve.localId)} className="text-gray-600 hover:text-red-400"><X size={14} /></button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Date — single field */}
        <div>
          <label className="block text-xs text-[var(--color-muted)] mb-1">Scheduled Date *</label>
          <input type="date" value={form.scheduled_date} onChange={(e) => setForm({ ...form, scheduled_date: e.target.value })}
            className={`w-full bg-[var(--color-bg)] border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--color-primary)] [color-scheme:dark] ${errors.scheduled_date ? 'border-red-500' : 'border-gray-700'}`} />
          {errors.scheduled_date && <p className="text-red-400 text-xs mt-1">{errors.scheduled_date}</p>}
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
          <label className="block text-xs text-[var(--color-muted)] mb-2">Services / Line Items</label>
          {services.length > 0 && (
            <div className="mb-3">
              <select value="" onChange={(e) => { const svc = services.find((s) => s.id === e.target.value); if (svc) addService(svc) }}
                className="w-full bg-[var(--color-bg)] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--color-primary)]">
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
            </div>
          )}
          <div className="flex gap-2 mb-3">
            <input type="text" value={customDesc} onChange={(e) => setCustomDesc(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCustomItem())}
              placeholder="Or type a custom service..."
              className="flex-1 bg-[var(--color-bg)] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--color-primary)]" />
            <button onClick={addCustomItem}
              className="bg-[var(--color-bg)] border border-gray-700 rounded-lg px-3 py-2 text-[var(--color-muted)] hover:text-white hover:border-[var(--color-primary)] transition">
              <Plus size={16} />
            </button>
          </div>
          {lineItems.length > 0 && (
            <div className="space-y-2">
              {lineItems.map((item, i) => (
                <div key={i} className="bg-[var(--color-bg)] rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <span className="text-white text-sm">{item.description}</span>
                    </div>
                    {vehicles.length > 1 && (
                      <select value={item.vehicle_id || ''} onChange={(e) => updateLineItem(i, 'vehicle_id', e.target.value || null)}
                        className="bg-[var(--color-surface)] border border-gray-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-[var(--color-primary)] max-w-[140px]">
                        <option value="">No vehicle</option>
                        {vehicles.filter((v) => v.decoded).map((v) => (
                          <option key={v.localId} value={v.localId}>{v.year} {v.make} {v.model}</option>
                        ))}
                      </select>
                    )}
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-[var(--color-muted)]">Qty</label>
                      <input type="number" min="1" value={item.quantity}
                        onChange={(e) => updateLineItem(i, 'quantity', parseInt(e.target.value) || 1)}
                        className="w-14 bg-[var(--color-surface)] border border-gray-700 rounded px-2 py-1 text-sm text-white text-center focus:outline-none focus:border-[var(--color-primary)]" />
                      <label className="text-xs text-[var(--color-muted)]">$</label>
                      <input type="number" min="0" step="0.01" value={item.unit_price || ''}
                        onChange={(e) => updateLineItem(i, 'unit_price', parseFloat(e.target.value) || 0)}
                        placeholder="0.00"
                        className="w-20 bg-[var(--color-surface)] border border-gray-700 rounded px-2 py-1 text-sm text-white text-right focus:outline-none focus:border-[var(--color-primary)]" />
                    </div>
                    <button onClick={() => removeLineItem(i)} className="text-gray-600 hover:text-red-400 ml-1"><X size={14} /></button>
                  </div>
                  <textarea value={item.notes || ''} onChange={(e) => updateLineItem(i, 'notes', e.target.value || null)}
                    rows={1} placeholder="Notes / findings for this service..."
                    onInput={(e) => { const t = e.target as HTMLTextAreaElement; t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px' }}
                    className="w-full mt-1.5 bg-[var(--color-surface)] border border-gray-700 rounded px-2 py-1 text-xs text-[var(--color-muted)] focus:text-white focus:outline-none focus:border-[var(--color-primary)] resize-none overflow-hidden" />
                </div>
              ))}
              <div className="flex justify-end px-3 pt-1">
                <span className="text-xs text-[var(--color-muted)]">Total: </span>
                <span className="text-sm text-white font-medium ml-1">
                  ${lineItems.reduce((sum, li) => sum + (li.quantity * li.unit_price), 0).toFixed(2)}
                </span>
              </div>
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
