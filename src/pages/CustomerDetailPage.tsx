import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Save, AlertTriangle, Car, Plus, Trash2 } from 'lucide-react'
import { getCustomer, saveCustomer, getVehiclesByCustomer, saveVehicle, type Customer } from '../lib/db'

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA',
  'ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK',
  'OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'
]

export default function CustomerDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isNew = id === 'new'

  const [customer, setCustomer] = useState<Partial<Customer>>({
    name: '',
    customer_type: 'shop',
    primary_contact_name: '',
    phone: '',
    email: '',
    address_street: '',
    address_city: '',
    address_state: '',
    address_zip: '',
    notes: '',
    red_flag: false,
    red_flag_reason: '',
    discount_percent: 0,
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [vehicles, setVehicles] = useState<any[]>([])
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(!isNew)

  useEffect(() => {
    if (!isNew && id) loadCustomer(id)
  }, [id])

  async function loadCustomer(customerId: string) {
    try {
      const c = await getCustomer(customerId)
      setCustomer(c)
      const v = await getVehiclesByCustomer(customerId)
      setVehicles(v)
    } catch (err) { console.error(err) }
    setLoading(false)
  }

  function validate(): boolean {
    const e: Record<string, string> = {}
    const c = customer

    if (c.customer_type === 'shop') {
      if (!c.name?.trim()) e.name = 'Shop name is required'
      if (!c.phone?.trim()) e.phone = 'Phone is required'
      if (!c.email?.trim()) e.email = 'Email is required'
      if (!c.address_street?.trim()) e.address_street = 'Street address is required'
      if (!c.address_city?.trim()) e.address_city = 'City is required'
      if (!c.address_state) e.address_state = 'State is required'
      if (!c.address_zip?.trim()) e.address_zip = 'ZIP is required'
    } else {
      if (!c.name?.trim()) e.name = 'Name is required'
      if (!c.phone?.trim()) e.phone = 'Phone is required'
      if (!c.email?.trim()) e.email = 'Email is required'
      // address is optional for individuals
    }

    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSave() {
    if (!validate()) return
    setSaving(true)
    try {
      const saved = await saveCustomer(customer)
      navigate(`/customers/${saved.id}`, { replace: true })
    } catch (err) { console.error(err) }
    setSaving(false)
  }

  async function handleAddVehicle() {
    const vin = prompt('Enter VIN:')
    if (!vin) return
    try {
      const res = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/decodevin/${vin}?format=json`)
      const json = await res.json()
      const results = json.Results
      const getVal = (name: string) => results.find((r: any) => r.Variable === name)?.Value || ''

      const vehicle = await saveVehicle({
        customer_id: customer.id!,
        vin: vin.toUpperCase(),
        year: parseInt(getVal('Model Year')) || null,
        make: getVal('Make'),
        model: getVal('Model'),
        engine: getVal('Engine Model'),
        transmission: getVal('Transmission Style'),
      })
      setVehicles([...vehicles, vehicle])
    } catch (err) {
      alert('Failed to decode VIN. Try again.')
    }
  }

  function setField(field: string, value: any) {
    setCustomer((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) setErrors((prev) => { const n = { ...prev }; delete n[field]; return n })
  }

  function handleNameChange(value: string, part: 'first' | 'last') {
    const parts = (customer.name || '').split(' ')
    const first = part === 'first' ? value : (parts[0] || '')
    const last = part === 'last' ? value : (parts.slice(1).join(' ') || '')
    setField('name', `${first} ${last}`.trim())
  }

  if (loading) return <div className="p-6 text-[var(--color-muted)]">Loading...</div>

  const isShop = customer.customer_type === 'shop'
  const firstName = isShop ? '' : (customer.name || '').split(' ')[0] || ''
  const lastName = isShop ? '' : (customer.name || '').split(' ').slice(1).join(' ') || ''

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => navigate('/customers')} className="text-[var(--color-muted)] hover:text-white">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-xl font-bold">{isNew ? 'New Customer' : customer.name}</h1>
        <div className="flex-1" />
        <button onClick={handleSave} disabled={saving}
          className="bg-[var(--color-primary)] text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 hover:brightness-110 disabled:opacity-50 transition">
          <Save size={16} />{saving ? 'Saving...' : 'Save'}
        </button>
      </div>

      <div className="bg-[var(--color-surface)] rounded-lg p-6 space-y-4 mb-6">
        {/* Type toggle */}
        <div className="flex gap-2">
          {(['shop', 'individual'] as const).map((t) => (
            <button key={t} onClick={() => setField('customer_type', t)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${
                customer.customer_type === t ? 'bg-[var(--color-primary)] text-white' : 'bg-[var(--color-bg)] text-[var(--color-muted)] hover:text-white'
              }`}>
              {t === 'shop' ? 'Repair Shop' : 'Individual'}
            </button>
          ))}
        </div>

        {/* Name fields */}
        {isShop ? (
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Shop Name *</label>
            <input type="text" value={customer.name} onChange={(e) => setField('name', e.target.value)}
              className={`w-full bg-[var(--color-bg)] border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[var(--color-primary)] ${errors.name ? 'border-red-500' : 'border-gray-700'}`}
              placeholder="e.g. Bailey Nurseries" />
            {errors.name && <p className="text-red-400 text-xs mt-1">{errors.name}</p>}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-[var(--color-muted)] mb-1">First Name *</label>
              <input type="text" value={firstName} onChange={(e) => handleNameChange(e.target.value, 'first')}
                className={`w-full bg-[var(--color-bg)] border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[var(--color-primary)] ${errors.name ? 'border-red-500' : 'border-gray-700'}`} />
            </div>
            <div>
              <label className="block text-xs text-[var(--color-muted)] mb-1">Last Name *</label>
              <input type="text" value={lastName} onChange={(e) => handleNameChange(e.target.value, 'last')}
                className={`w-full bg-[var(--color-bg)] border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[var(--color-primary)] ${errors.name ? 'border-red-500' : 'border-gray-700'}`} />
            </div>
          </div>
        )}

        {/* Shop: Primary contact */}
        {isShop && (
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Primary Contact Name</label>
            <input type="text" value={customer.primary_contact_name || ''} onChange={(e) => setField('primary_contact_name', e.target.value)}
              className="w-full bg-[var(--color-bg)] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[var(--color-primary)]"
              placeholder="e.g. Mike at the front desk" />
          </div>
        )}

        {/* Contact info */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Phone *</label>
            <input type="text" value={customer.phone || ''} onChange={(e) => setField('phone', e.target.value)}
              className={`w-full bg-[var(--color-bg)] border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[var(--color-primary)] ${errors.phone ? 'border-red-500' : 'border-gray-700'}`} />
            {errors.phone && <p className="text-red-400 text-xs mt-1">{errors.phone}</p>}
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Email *</label>
            <input type="email" value={customer.email || ''} onChange={(e) => setField('email', e.target.value)}
              className={`w-full bg-[var(--color-bg)] border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[var(--color-primary)] ${errors.email ? 'border-red-500' : 'border-gray-700'}`} />
            {errors.email && <p className="text-red-400 text-xs mt-1">{errors.email}</p>}
          </div>
        </div>

        {/* Address */}
        <div>
          <label className="block text-xs text-[var(--color-muted)] mb-1">
            Address {isShop ? '*' : '(optional)'}
          </label>
          <input type="text" value={customer.address_street || ''} onChange={(e) => setField('address_street', e.target.value)}
            placeholder="Street address"
            className={`w-full bg-[var(--color-bg)] border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[var(--color-primary)] mb-2 ${errors.address_street ? 'border-red-500' : 'border-gray-700'}`} />
          {errors.address_street && <p className="text-red-400 text-xs mb-1">{errors.address_street}</p>}

          <div className="grid grid-cols-3 gap-2">
            <input type="text" value={customer.address_city || ''} onChange={(e) => setField('address_city', e.target.value)}
              placeholder="City"
              className={`bg-[var(--color-bg)] border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[var(--color-primary)] ${errors.address_city ? 'border-red-500' : 'border-gray-700'}`} />
            <select value={customer.address_state || ''} onChange={(e) => setField('address_state', e.target.value)}
              className={`bg-[var(--color-bg)] border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[var(--color-primary)] ${errors.address_state ? 'border-red-500' : 'border-gray-700'}`}>
              <option value="">State</option>
              {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <input type="text" value={customer.address_zip || ''} onChange={(e) => setField('address_zip', e.target.value)}
              placeholder="ZIP"
              className={`bg-[var(--color-bg)] border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[var(--color-primary)] ${errors.address_zip ? 'border-red-500' : 'border-gray-700'}`} />
          </div>
          {isShop && (
            <>
              {errors.address_city && <p className="text-red-400 text-xs mt-1">{errors.address_city}</p>}
              {errors.address_state && <p className="text-red-400 text-xs mt-1">{errors.address_state}</p>}
              {errors.address_zip && <p className="text-red-400 text-xs mt-1">{errors.address_zip}</p>}
            </>
          )}
        </div>

        {/* Discount */}
        <div>
          <label className="block text-xs text-[var(--color-muted)] mb-1">Discount %</label>
          <input type="number" min="0" max="100" value={customer.discount_percent || 0}
            onChange={(e) => setField('discount_percent', parseFloat(e.target.value) || 0)}
            className="w-24 bg-[var(--color-bg)] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[var(--color-primary)]" />
        </div>

        {/* Notes */}
        <div>
          <label className="block text-xs text-[var(--color-muted)] mb-1">Notes</label>
          <textarea value={customer.notes || ''} onChange={(e) => setField('notes', e.target.value)} rows={3}
            className="w-full bg-[var(--color-bg)] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[var(--color-primary)] resize-none" />
        </div>

        {/* Red flag */}
        <div className="flex items-center gap-3 pt-2 border-t border-gray-800">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={customer.red_flag || false} onChange={(e) => setField('red_flag', e.target.checked)} className="rounded" />
            <span className="text-sm text-red-400 flex items-center gap-1"><AlertTriangle size={14} />Red Flag</span>
          </label>
          {customer.red_flag && (
            <input type="text" value={customer.red_flag_reason || ''} onChange={(e) => setField('red_flag_reason', e.target.value)}
              placeholder="Reason for flag..." className="flex-1 bg-[var(--color-bg)] border border-gray-700 rounded-lg px-3 py-1 text-white text-sm focus:outline-none focus:border-red-500" />
          )}
        </div>
      </div>

      {/* Vehicles (individuals only) */}
      {!isNew && !isShop && (
        <div className="bg-[var(--color-surface)] rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-[var(--color-muted)] flex items-center gap-2"><Car size={16} />Vehicles ({vehicles.length})</h2>
            <button onClick={handleAddVehicle} className="text-[var(--color-primary)] text-sm flex items-center gap-1 hover:underline"><Plus size={14} />Add Vehicle</button>
          </div>
          {vehicles.length === 0 ? (
            <p className="text-xs text-[var(--color-muted)]">No vehicles. Add one by VIN.</p>
          ) : (
            <div className="space-y-2">
              {vehicles.map((v: any) => (
                <div key={v.id} className="flex items-center justify-between bg-[var(--color-bg)] rounded-lg px-4 py-3">
                  <div>
                    <span className="text-white text-sm font-medium">{v.year} {v.make} {v.model}</span>
                    <span className="text-[var(--color-muted)] text-xs ml-3">VIN: {v.vin}</span>
                    {v.engine && <span className="text-[var(--color-muted)] text-xs ml-3">{v.engine}</span>}
                  </div>
                  <button className="text-gray-600 hover:text-red-400"><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Shop history placeholder */}
      {!isNew && isShop && (
        <div className="bg-[var(--color-surface)] rounded-lg p-6">
          <h2 className="text-sm font-medium text-[var(--color-muted)] mb-2">Shop History</h2>
          <p className="text-xs text-[var(--color-muted)]">Past jobs and invoices will appear here once jobs are created.</p>
        </div>
      )}
    </div>
  )
}
