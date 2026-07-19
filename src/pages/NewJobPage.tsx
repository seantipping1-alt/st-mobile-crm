import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { ArrowLeft, Save, Search, Plus, X } from 'lucide-react'
import { getCustomers, getTeam, getServices, saveJob, saveJobLineItems, saveJobVehicles, saveCustomer, saveVehicle, checkDuplicateCustomer, type Customer, type Service } from '../lib/db'
import { toast } from '../components/Toast'

const JOB_TYPES = ['diagnostic', 'programming', 'adas', 'keys', 'other'] as const
const JOB_TYPE_LABELS: Record<string, string> = {
  diagnostic: 'Diagnostic', programming: 'Programming', adas: 'ADAS', keys: 'Keys', other: 'Other'
}
const CATEGORY_LABELS: Record<string, string> = {
  diagnostic: 'Diagnostic', programming: 'Programming', adas: 'ADAS', keys: 'Keys', fee: 'Fees', inventory: 'Inventory / Parts', other: 'Other'
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
  const location = useLocation()
  const calendarPrefill = (location.state as any)?.calendarPrefill || null
  const [customers, setCustomers] = useState<Customer[]>([])
  const [team, setTeam] = useState<any[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [customerSearch, setCustomerSearch] = useState(calendarPrefill?.shop_name || '')
  const [showNewCustomer, setShowNewCustomer] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const [form, setForm] = useState({
    customer_id: '',
    job_type: (calendarPrefill?.job_type || 'diagnostic') as string,
    assigned_to: '',
    shop_name: calendarPrefill?.shop_name || '',
    shop_ro_number: '',
    job_description: calendarPrefill?.job_description || '',
    scheduled_date: calendarPrefill?.scheduled_start ? new Date(calendarPrefill.scheduled_start).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
    internal_notes: '',
    gcal_event_id: calendarPrefill?.gcal_event_id || '',
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


  // Multiple vehicles
  const [vehicles, setVehicles] = useState<VehicleEntry[]>([])
  const [vinInput, setVinInput] = useState('')
  const [showManualVehicle, setShowManualVehicle] = useState(false)
  const [manualVehicle, setManualVehicle] = useState({ year: '', make: '', model: '', engine: '' })
  const [newCustDupes, setNewCustDupes] = useState<{ type: string; customer: Customer }[]>([])

  const [saving, setSaving] = useState(false)
  const [pendingRemoveItem, setPendingRemoveItem] = useState<number | null>(null)
  const [pendingRemoveVehicle, setPendingRemoveVehicle] = useState<string | null>(null)
  const [showUnsavedPrompt, setShowUnsavedPrompt] = useState(false)

  const isDirty = useCallback(() => {
    if (form.customer_id) return true
    if (showNewCustomer && newCust.name.trim()) return true
    if (vehicles.length > 0) return true
    if (lineItems.length > 0) return true
    if (form.job_description.trim()) return true
    if (form.internal_notes.trim()) return true
    if (form.shop_ro_number.trim()) return true
    return false
  }, [form, showNewCustomer, newCust.name, vehicles, lineItems])

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

  // Intercept browser back button (popstate) with unsaved changes
  useEffect(() => {
    // Push a duplicate history entry so pressing back stays on this page
    window.history.pushState(null, '', window.location.href)
    function handlePopState() {
      if (isDirty()) {
        // Re-push to prevent leaving, show our modal
        window.history.pushState(null, '', window.location.href)
        setShowUnsavedPrompt(true)
      }
      // If not dirty, the default back navigation happens naturally
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [isDirty])

  useEffect(() => {
    getTeam().then((t) => {
      setTeam(t)
      // Auto-select tech from calendar prefill
      if (calendarPrefill?.tech_name && t.length > 0) {
        const match = t.find((m: any) => m.name.toLowerCase() === calendarPrefill.tech_name.toLowerCase())
        if (match) setForm((prev) => ({ ...prev, assigned_to: match.id }))
      }
    })
    getServices().then(setServices).catch(() => {})
    loadCustomers(calendarPrefill?.shop_name || '')
  }, [])

  // Calendar prefill: auto-add vehicle(s) if provided
  useEffect(() => {
    if (!calendarPrefill) return
    const prefillVehicles = calendarPrefill.vehicles || []

    if (prefillVehicles.length > 0) {
      // Multi-vehicle or structured vehicle data from parser
      const entries: VehicleEntry[] = []
      for (const v of prefillVehicles) {
        if (v.vin && v.vin.length === 17) {
          // Will trigger VIN decode
          decodeAndAddVin(v.vin)
        } else if (v.make) {
          entries.push({
            localId: `cal-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            vin: '',
            year: v.year || '',
            make: v.make || '',
            model: v.model || '',
            engine: '',
            decoding: false,
            decoded: true,
            manual: true,
          })
        }
      }
      if (entries.length > 0) setVehicles(entries)
    } else {
      // Fallback: single vehicle from title parse
      const { vehicle_year, vehicle_make, vehicle_model, vin } = calendarPrefill
      if (vin && vin.length === 17) {
        decodeAndAddVin(vin)
      } else if (vehicle_make) {
        setVehicles([{
          localId: `cal-${Date.now()}`,
          vin: '',
          year: vehicle_year || '',
          make: vehicle_make || '',
          model: vehicle_model || '',
          engine: '',
          decoding: false,
          decoded: true,
          manual: true,
        }])
      }
    }

    // Pre-fill new customer form with address from calendar
    if (calendarPrefill.address_street) {
      setNewCust((prev) => ({
        ...prev,
        name: calendarPrefill.shop_name || '',
        customer_type: 'shop' as const,
        address_street: calendarPrefill.address_street || '',
        address_city: calendarPrefill.address_city || '',
        address_state: calendarPrefill.address_state || '',
        address_zip: calendarPrefill.address_zip || '',
      }))
    }
  }, [calendarPrefill])

  async function loadCustomers(search?: string) {
    const data = await getCustomers(search)
    setCustomers(data)
  }

  useEffect(() => {
    const t = setTimeout(() => loadCustomers(customerSearch), 300)
    return () => clearTimeout(t)
  }, [customerSearch])

  // Inline duplicate detection on customer search (shows matches before clicking "Add New Customer")
  const [searchDupes, setSearchDupes] = useState<{ type: string; customer: Customer }[]>([])
  useEffect(() => {
    if (!customerSearch.trim() || customerSearch.trim().length < 3 || form.customer_id) {
      setSearchDupes([])
      return
    }
    const t = setTimeout(async () => {
      const matches = await checkDuplicateCustomer('', customerSearch)
      // Only show dupes that aren't already in the customer list results
      const customerIds = new Set(customers.map(c => c.id))
      const extraMatches = matches.filter(m => !customerIds.has(m.customer.id))
      setSearchDupes(extraMatches)
    }, 500)
    return () => clearTimeout(t)
  }, [customerSearch, customers, form.customer_id])
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
      const decodedYear = getVal('Model Year')
      const decodedMake = getVal('Make')
      const decodedModel = getVal('Model')
      const decodedEngine = getVal('Engine Model')

      setVehicles((prev) => {
        // Check if there's a no-VIN vehicle with matching year/make (from calendar prefill)
        const noVinMatch = prev.find((ve) =>
          ve.localId !== lid && !ve.vin &&
          ve.year === decodedYear &&
          ve.make.toLowerCase().replace(/[-\s]/g, '') === decodedMake.toLowerCase().replace(/[-\s]/g, '')
        )

        let updated = prev.map((ve) => ve.localId === lid
          ? { ...ve, year: decodedYear, make: decodedMake, model: decodedModel, engine: decodedEngine, decoding: false, decoded: true }
          : ve
        )

        // Remove the duplicate no-VIN entry if found
        if (noVinMatch) {
          updated = updated.filter((ve) => ve.localId !== noVinMatch.localId)
        }

        return updated
      })
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
        status: 'in_progress',
        shop_name: form.shop_name || null,
        shop_ro_number: form.shop_ro_number || null,
        problem_description: form.job_description || null,
        internal_notes: form.internal_notes || null,
        scheduled_start: form.scheduled_date + 'T12:00:00',
        gcal_event_id: form.gcal_event_id || null,
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

  return (
    <div className="p-4 md:p-6 max-w-2xl pb-24 md:pb-6">
      <div className="flex items-center gap-4 mb-6 sticky top-0 z-30 bg-[var(--color-bg)] py-3 -mx-4 px-4 md:-mx-6 md:px-6">
        <button onClick={() => isDirty() ? setShowUnsavedPrompt(true) : navigate('/jobs')} className="text-[var(--color-muted)] hover:text-white min-h-[44px] min-w-[44px] flex items-center justify-center"><ArrowLeft size={20} /></button>
        <h1 className="text-xl font-bold">New Job</h1>
        <div className="flex-1" />
        {/* Desktop: inline button */}
        <button onClick={handleSave} disabled={saving}
          className="hidden md:flex bg-[var(--color-primary)] text-white px-4 py-2 rounded-lg text-sm font-medium items-center gap-2 hover:brightness-110 disabled:opacity-50 transition min-h-[44px]">
          <Save size={16} />{saving ? 'Creating...' : 'Create Job'}
        </button>
      </div>

      {/* Mobile: fixed bottom Create Job bar */}
      <div className="md:hidden fixed bottom-16 left-0 right-0 z-40 px-4 pb-3 pt-2 bg-gradient-to-t from-[var(--color-bg)] via-[var(--color-bg)] to-transparent">
        <button onClick={handleSave} disabled={saving}
          className="w-full bg-[var(--color-primary)] text-white py-3 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 hover:brightness-110 disabled:opacity-50 transition min-h-[48px] shadow-lg shadow-black/30">
          <Save size={16} />{saving ? 'Creating...' : 'Create Job'}
        </button>
      </div>

      <div className="bg-[var(--color-surface)] rounded-lg p-4 md:p-6 space-y-4">
        {/* Customer */}
        <div>
          <label className="block text-xs text-[var(--color-muted)] mb-1">Customer *</label>
          {!showNewCustomer ? (
            <div>
              <div className="relative mb-2">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input type="text" value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)}
                  placeholder="Search customers..." className={`w-full bg-[var(--color-bg)] border rounded-lg pl-9 pr-4 py-2 text-sm text-white focus:outline-none focus:border-[var(--color-primary)] min-h-[44px] ${errors.customer_id ? 'border-red-500' : 'border-gray-700'}`} />
              </div>
              <div className="max-h-48 overflow-y-auto space-y-0.5 mb-2">
                {(() => {
                  // Build unified list: direct matches + fuzzy matches
                  const searchLower = customerSearch.trim().toLowerCase()
                  const directIds = new Set(customers.map(c => c.id))

                  // Sort direct matches: exact first, then alphabetical
                  const sortedDirect = [...customers].sort((a, b) => {
                    const aExact = a.name.toLowerCase() === searchLower ? 1 : 0
                    const bExact = b.name.toLowerCase() === searchLower ? 1 : 0
                    if (aExact !== bExact) return bExact - aExact
                    return a.name.localeCompare(b.name)
                  })

                  // Fuzzy matches not already in direct results
                  const fuzzy = searchDupes.filter(dw => !directIds.has(dw.customer.id))

                  return (
                    <>
                      {sortedDirect.map((c) => {
                        const isExact = searchLower.length > 0 && c.name.toLowerCase() === searchLower
                        return (
                          <button key={c.id} onClick={() => setForm({ ...form, customer_id: c.id, shop_name: c.name })}
                            className={`w-full text-left px-3 py-2 rounded text-sm transition min-h-[44px] flex items-center ${form.customer_id === c.id ? 'bg-[var(--color-primary)] text-white' : isExact ? 'border border-[var(--color-primary)] text-white' : 'text-white hover:bg-white/5'}`}
                            style={isExact && form.customer_id !== c.id ? { backgroundColor: 'rgba(59, 130, 246, 0.1)' } : undefined}>
                            {c.name} {c.phone && <span className="text-xs opacity-60">— {c.phone}</span>}
                            {isExact && form.customer_id !== c.id && <span className="ml-auto text-[var(--color-primary)] text-xs font-medium">✓ Exact match</span>}
                          </button>
                        )
                      })}
                      {fuzzy.length > 0 && !form.customer_id && (
                        <>
                          <div className="flex items-center gap-2 pt-2 pb-1 px-1">
                            <div className="flex-1 border-t border-gray-700" />
                            <span className="text-[10px] text-[var(--color-muted)] uppercase tracking-wider">Similar</span>
                            <div className="flex-1 border-t border-gray-700" />
                          </div>
                          {fuzzy.map((dw, i) => (
                            <button key={`fuzzy-${i}`} onClick={() => { setForm({ ...form, customer_id: dw.customer.id, shop_name: dw.customer.name }); setSearchDupes([]) }}
                              className={`w-full text-left px-3 py-2 rounded text-sm transition min-h-[44px] flex items-center text-[var(--color-muted)] hover:bg-white/5`}>
                              {dw.customer.name} {dw.customer.phone && <span className="text-xs opacity-50">— {dw.customer.phone}</span>}
                            </button>
                          ))}
                        </>
                      )}
                    </>
                  )
                })()}
              </div>
              <button onClick={() => setShowNewCustomer(true)} className="text-[var(--color-primary)] text-xs hover:underline min-h-[44px]">+ New customer</button>
              {errors.customer_id && <p className="text-red-400 text-xs mt-1">{errors.customer_id}</p>}
            </div>
          ) : (
            <div className="space-y-3 p-4 bg-[var(--color-bg)] rounded-lg">
              <div className="flex gap-2">
                {(['shop', 'individual'] as const).map((t) => (
                  <button key={t} onClick={() => setNewCustField('customer_type', t)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition min-h-[44px] ${newCust.customer_type === t ? 'bg-[var(--color-primary)] text-white' : 'bg-[var(--color-surface)] text-[var(--color-muted)] hover:text-white'}`}>
                    {t === 'shop' ? 'Repair Shop' : 'Individual'}
                  </button>
                ))}
              </div>
              <div>
                <input type="text" value={newCust.name} onChange={(e) => setNewCustField('name', e.target.value)}
                  placeholder={isShop ? 'Shop name *' : 'Full name *'}
                  className={`w-full bg-[var(--color-surface)] border rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--color-primary)] min-h-[44px] ${newCustErrors.name ? 'border-red-500' : 'border-gray-700'}`} />
                {newCustErrors.name && <p className="text-red-400 text-xs mt-1">{newCustErrors.name}</p>}
              </div>
              {isShop && (
                <input type="text" value={newCust.primary_contact_name} onChange={(e) => setNewCustField('primary_contact_name', e.target.value)}
                  placeholder="Primary contact name"
                  className="w-full bg-[var(--color-surface)] border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--color-primary)] min-h-[44px]" />
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <div>
                  <input type="text" value={newCust.phone} onChange={(e) => setNewCustField('phone', e.target.value)} placeholder="Phone *"
                    className={`w-full bg-[var(--color-surface)] border rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--color-primary)] min-h-[44px] ${newCustErrors.phone ? 'border-red-500' : 'border-gray-700'}`} />
                  {newCustErrors.phone && <p className="text-red-400 text-xs mt-1">{newCustErrors.phone}</p>}
                </div>
                <div>
                  <input type="text" value={newCust.email} onChange={(e) => setNewCustField('email', e.target.value)} placeholder="Email *"
                    className={`w-full bg-[var(--color-surface)] border rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--color-primary)] min-h-[44px] ${newCustErrors.email ? 'border-red-500' : 'border-gray-700'}`} />
                  {newCustErrors.email && <p className="text-red-400 text-xs mt-1">{newCustErrors.email}</p>}
                </div>
              </div>
              <div>
                <label className="block text-xs text-[var(--color-muted)] mb-1">Address {isShop ? '*' : '(optional)'}</label>
                <input type="text" value={newCust.address_street} onChange={(e) => setNewCustField('address_street', e.target.value)} placeholder="Street address"
                  className={`w-full bg-[var(--color-surface)] border rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--color-primary)] mb-2 min-h-[44px] ${newCustErrors.address_street ? 'border-red-500' : 'border-gray-700'}`} />
                {newCustErrors.address_street && <p className="text-red-400 text-xs mb-1">{newCustErrors.address_street}</p>}
                <div className="grid grid-cols-3 gap-1.5 md:gap-2">
                  <div>
                    <input type="text" value={newCust.address_city} onChange={(e) => setNewCustField('address_city', e.target.value)} placeholder="City"
                      className={`w-full bg-[var(--color-surface)] border rounded px-2 md:px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--color-primary)] min-h-[44px] ${newCustErrors.address_city ? 'border-red-500' : 'border-gray-700'}`} />
                    {newCustErrors.address_city && <p className="text-red-400 text-xs mt-1">{newCustErrors.address_city}</p>}
                  </div>
                  <div>
                    <select value={newCust.address_state} onChange={(e) => setNewCustField('address_state', e.target.value)}
                      className={`w-full bg-[var(--color-surface)] border rounded px-2 py-2 text-sm text-white focus:outline-none focus:border-[var(--color-primary)] min-h-[44px] ${newCustErrors.address_state ? 'border-red-500' : 'border-gray-700'}`}>
                      <option value="">State</option>
                      {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                    {newCustErrors.address_state && <p className="text-red-400 text-xs mt-1">{newCustErrors.address_state}</p>}
                  </div>
                  <div>
                    <input type="text" value={newCust.address_zip} onChange={(e) => setNewCustField('address_zip', e.target.value)} placeholder="ZIP"
                      className={`w-full bg-[var(--color-surface)] border rounded px-2 md:px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--color-primary)] min-h-[44px] ${newCustErrors.address_zip ? 'border-red-500' : 'border-gray-700'}`} />
                    {newCustErrors.address_zip && <p className="text-red-400 text-xs mt-1">{newCustErrors.address_zip}</p>}
                  </div>
                </div>
              </div>
              <button onClick={() => { setShowNewCustomer(false); setNewCustErrors({}); setNewCustDupes([]) }} className="text-[var(--color-muted)] text-xs hover:text-white min-h-[44px]">← Back to search</button>

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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Job Type *</label>
            <select value={form.job_type} onChange={(e) => setForm({ ...form, job_type: e.target.value })}
              className={`w-full bg-[var(--color-bg)] border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--color-primary)] min-h-[44px] ${errors.job_type ? 'border-red-500' : 'border-gray-700'}`}>
              <option value="">Select type...</option>
              {JOB_TYPES.map((t) => <option key={t} value={t}>{JOB_TYPE_LABELS[t]}</option>)}
            </select>
            {errors.job_type && <p className="text-red-400 text-xs mt-1">{errors.job_type}</p>}
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Assign Tech *</label>
            <select value={form.assigned_to} onChange={(e) => setForm({ ...form, assigned_to: e.target.value })}
              className={`w-full bg-[var(--color-bg)] border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--color-primary)] min-h-[44px] ${errors.assigned_to ? 'border-red-500' : 'border-gray-700'}`}>
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
              className="flex-1 min-w-0 bg-[var(--color-bg)] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-[var(--color-primary)] min-h-[44px]" />
            <button onClick={() => { if (vinInput.length === 17) decodeAndAddVin(vinInput) }}
              className="bg-[var(--color-bg)] border border-gray-700 rounded-lg px-3 py-2 text-[var(--color-muted)] hover:text-white hover:border-[var(--color-primary)] transition min-h-[44px] min-w-[44px] flex items-center justify-center">
              <Plus size={16} />
            </button>
          </div>
          {!showManualVehicle ? (
            <button onClick={() => setShowManualVehicle(true)}
              className="text-[var(--color-primary)] text-xs hover:underline mb-2 min-h-[44px]">Don't have the VIN? Enter manually</button>
          ) : (
            <div className="bg-[var(--color-bg)] rounded-lg p-3 mb-2 space-y-2">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <input type="text" value={manualVehicle.year} onChange={(e) => setManualVehicle({ ...manualVehicle, year: e.target.value })}
                  placeholder="Year" maxLength={4}
                  className="bg-[var(--color-surface)] border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--color-primary)] min-h-[44px]" />
                <input type="text" value={manualVehicle.make} onChange={(e) => setManualVehicle({ ...manualVehicle, make: e.target.value })}
                  placeholder="Make *"
                  className="bg-[var(--color-surface)] border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--color-primary)] min-h-[44px]" />
                <input type="text" value={manualVehicle.model} onChange={(e) => setManualVehicle({ ...manualVehicle, model: e.target.value })}
                  placeholder="Model"
                  className="bg-[var(--color-surface)] border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--color-primary)] min-h-[44px]" />
                <input type="text" value={manualVehicle.engine} onChange={(e) => setManualVehicle({ ...manualVehicle, engine: e.target.value })}
                  placeholder="Engine"
                  className="bg-[var(--color-surface)] border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--color-primary)] min-h-[44px]" />
              </div>
              <div className="flex gap-2">
                <button onClick={addManualVehicle} disabled={!manualVehicle.make.trim()}
                  className="bg-[var(--color-primary)] text-white px-3 py-2 rounded text-sm hover:brightness-110 disabled:opacity-50 transition min-h-[44px]">
                  Add Vehicle
                </button>
                <button onClick={() => { setShowManualVehicle(false); setManualVehicle({ year: '', make: '', model: '', engine: '' }) }}
                  className="text-[var(--color-muted)] text-xs hover:text-white min-h-[44px] flex items-center">Cancel</button>
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
                  <button onClick={() => setPendingRemoveVehicle(ve.localId)} className="text-gray-600 hover:text-red-400 min-h-[44px] min-w-[44px] flex items-center justify-center"><X size={14} /></button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Date — single field */}
        <div>
          <label className="block text-xs text-[var(--color-muted)] mb-1">Scheduled Date *</label>
          <input type="date" value={form.scheduled_date} onChange={(e) => setForm({ ...form, scheduled_date: e.target.value })}
            className={`w-full bg-[var(--color-bg)] border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--color-primary)] [color-scheme:dark] min-h-[44px] ${errors.scheduled_date ? 'border-red-500' : 'border-gray-700'}`} />
          {errors.scheduled_date && <p className="text-red-400 text-xs mt-1">{errors.scheduled_date}</p>}
        </div>

        {/* Shop / RO */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Shop Name</label>
            <input type="text" value={form.shop_name} onChange={(e) => setForm({ ...form, shop_name: e.target.value })}
              className="w-full bg-[var(--color-bg)] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--color-primary)] min-h-[44px]" />
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Shop RO #</label>
            <input type="text" value={form.shop_ro_number} onChange={(e) => setForm({ ...form, shop_ro_number: e.target.value })}
              className="w-full bg-[var(--color-bg)] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--color-primary)] min-h-[44px]" />
          </div>
        </div>

        {/* Job description */}
        <div>
          <label className="block text-xs text-[var(--color-muted)] mb-1">Job Description</label>
          <textarea value={form.job_description} onChange={(e) => setForm({ ...form, job_description: e.target.value })}
            rows={2} placeholder="What needs to be done?"
            onInput={(e) => { const t = e.target as HTMLTextAreaElement; t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px' }}
            onFocus={(e) => { const t = e.target as HTMLTextAreaElement; t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px' }}
            className="w-full bg-[var(--color-bg)] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--color-primary)] resize-none overflow-hidden" />
        </div>

        {/* Services / line items */}
        <div>
          <label className="block text-xs text-[var(--color-muted)] mb-2">Services / Line Items</label>
          {services.length > 0 && (
            <ServiceSearch services={services} onSelect={addService} />
          )}

          {lineItems.length > 0 && (
            <div className="space-y-2">
              {lineItems.map((item, i) => (
                <div key={i} className="bg-[var(--color-bg)] rounded-lg px-3 py-2.5">
                  <div className="flex flex-col md:flex-row md:items-center gap-2">
                    <div className="flex items-center justify-between md:flex-1">
                      <span className="text-white text-sm flex-1">{item.description}</span>
                      <button onClick={() => setPendingRemoveItem(i)} className="text-gray-600 hover:text-red-400 min-h-[44px] min-w-[44px] flex items-center justify-center md:hidden"><X size={14} /></button>
                    </div>
                    {vehicles.length > 1 && (
                      <select value={item.vehicle_id || ''} onChange={(e) => updateLineItem(i, 'vehicle_id', e.target.value || null)}
                        className="bg-[var(--color-surface)] border border-gray-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-[var(--color-primary)] w-full md:max-w-[140px] min-h-[44px] md:min-h-0">
                        <option value="">No vehicle</option>
                        {vehicles.filter((v) => v.decoded).map((v) => (
                          <option key={v.localId} value={v.localId}>{v.year} {v.make} {v.model}</option>
                        ))}
                      </select>
                    )}
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-[var(--color-muted)] hidden md:inline">Qty</label>
                      {/* Mobile: stepper buttons */}
                      <div className="flex items-center md:hidden">
                        <button type="button" onClick={() => updateLineItem(i, 'quantity', Math.max(1, (item.quantity || 1) - 1))}
                          className="w-10 h-10 flex items-center justify-center bg-[var(--color-surface)] border border-gray-700 rounded-l text-white text-lg font-medium active:bg-white/10">−</button>
                        <div className="w-10 h-10 flex items-center justify-center bg-[var(--color-bg)] border-t border-b border-gray-700 text-white text-sm font-medium">{item.quantity || 1}</div>
                        <button type="button" onClick={() => updateLineItem(i, 'quantity', (item.quantity || 1) + 1)}
                          className="w-10 h-10 flex items-center justify-center bg-[var(--color-surface)] border border-gray-700 rounded-r text-white text-lg font-medium active:bg-white/10">+</button>
                      </div>
                      {/* Desktop: number input */}
                      <input type="number" min="1" value={item.quantity}
                        onChange={(e) => updateLineItem(i, 'quantity', parseInt(e.target.value) || 1)}
                        className="hidden md:block w-14 bg-[var(--color-surface)] border border-gray-700 rounded px-2 py-1 text-sm text-white text-center focus:outline-none focus:border-[var(--color-primary)]" />
                      <label className="text-xs text-[var(--color-muted)]">$</label>
                      <input type="number" min="0" step="0.01" value={item.unit_price || ''}
                        onChange={(e) => updateLineItem(i, 'unit_price', parseFloat(e.target.value) || 0)}
                        placeholder="0.00"
                        className="w-20 bg-[var(--color-surface)] border border-gray-700 rounded px-2 py-1 text-sm text-white text-right focus:outline-none focus:border-[var(--color-primary)] min-h-[44px] md:min-h-0" />
                      <button onClick={() => setPendingRemoveItem(i)} className="text-gray-600 hover:text-red-400 min-h-[44px] min-w-[44px] hidden md:flex items-center justify-center"><X size={14} /></button>
                    </div>
                  </div>
                  <textarea value={item.notes || ''} onChange={(e) => updateLineItem(i, 'notes', e.target.value || null)}
                    rows={1} placeholder="Notes / findings for this service..."
                    onInput={(e) => { const t = e.target as HTMLTextAreaElement; t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px' }}
                    onFocus={(e) => { const t = e.target as HTMLTextAreaElement; t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px' }}
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
            rows={2} placeholder="Notes for the tech..."
            onInput={(e) => { const t = e.target as HTMLTextAreaElement; t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px' }}
            onFocus={(e) => { const t = e.target as HTMLTextAreaElement; t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px' }}
            className="w-full bg-[var(--color-bg)] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--color-primary)] resize-none overflow-hidden" />
        </div>
      </div>

      {/* Remove line item confirmation */}
      {pendingRemoveItem !== null && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setPendingRemoveItem(null)}>
          <div className="bg-[var(--color-surface)] rounded-lg p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-white font-medium mb-2">Remove Service</h3>
            <p className="text-[var(--color-muted)] text-sm mb-4">Are you sure you want to remove <span className="text-white">{lineItems[pendingRemoveItem]?.description}</span>?</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setPendingRemoveItem(null)}
                className="px-4 py-2 rounded-lg text-sm text-[var(--color-muted)] hover:text-white transition min-h-[44px]">Cancel</button>
              <button onClick={() => { removeLineItem(pendingRemoveItem); setPendingRemoveItem(null) }}
                className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-500 transition min-h-[44px]">Yes, Remove</button>
            </div>
          </div>
        </div>
      )}

      {/* Remove vehicle confirmation */}
      {pendingRemoveVehicle !== null && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setPendingRemoveVehicle(null)}>
          <div className="bg-[var(--color-surface)] rounded-lg p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-white font-medium mb-2">Remove Vehicle</h3>
            <p className="text-[var(--color-muted)] text-sm mb-4">Are you sure you want to remove this vehicle?</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setPendingRemoveVehicle(null)}
                className="px-4 py-2 rounded-lg text-sm text-[var(--color-muted)] hover:text-white transition min-h-[44px]">Cancel</button>
              <button onClick={() => { removeVehicle(pendingRemoveVehicle); setPendingRemoveVehicle(null) }}
                className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-500 transition min-h-[44px]">Yes, Remove</button>
            </div>
          </div>
        </div>
      )}

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
