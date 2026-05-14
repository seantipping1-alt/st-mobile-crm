import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Save, AlertTriangle, Car, Plus, Trash2 } from 'lucide-react'
import { getCustomer, saveCustomer, deleteCustomer, checkDuplicateCustomer, getVehiclesByCustomer, saveVehicle, type Customer } from '../lib/db'
import { toast } from '../components/Toast'

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
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [dupeWarning, setDupeWarning] = useState<{ type: string; customer: Customer }[]>([])

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

  // Check for duplicates when phone or name changes (debounced)
  useEffect(() => {
    if (!isNew) return
    const t = setTimeout(async () => {
      const matches = await checkDuplicateCustomer(customer.phone || '', customer.name || '')
      setDupeWarning(matches)
    }, 500)
    return () => clearTimeout(t)
  }, [customer.phone, customer.name, isNew])

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
    }

    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSave() {
    if (!validate()) return
    setSaving(true)
    try {
      const saved = await saveCustomer(customer)
      toast('Customer saved ✓')
      navigate(`/customers/${saved.id}`, { replace: true })
    } catch (err: any) {
      if (err?.code === '23505' && err?.message?.includes('phone')) {
        setErrors({ ...errors, phone: 'This phone number is already in use by another customer' })
      } else {
        console.error(err)
      }
    }
    setSaving(false)
  }

  async function handleDelete() {
    if (!customer.id) return
    setDeleting(true)
    try {
      const hasQbLink = !!(customer as any).qb_id
      await deleteCustomer(customer.id, hasQbLink)
      navigate('/customers')
    } catch (err) {
      console.error(err)
      setDeleting(false)
      setShowDeleteConfirm(false)
    }
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

  if (loading) return <div className="p-4 md:p-6 text-[var(--color-muted)]">Loading...</div>

  const isShop = customer.customer_type === 'shop'
  const firstName = isShop ? '' : (customer.name || '').split(' ')[0] || ''
  const lastName = isShop ? '' : (customer.name || '').split(' ').slice(1).join(' ') || ''
  const hasQbLink = !!(customer as any).qb_id

  return (
    <div className="p-4 md:p-6 max-w-2xl">
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => navigate('/customers')} className="text-[var(--color-muted)] hover:text-white">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-xl font-bold">{isNew ? 'New Customer' : customer.name}</h1>
        <div className="flex-1" />
        {!isNew && (
          <button onClick={() => setShowDeleteConfirm(true)}
            className="text-gray-500 hover:text-red-400 transition p-2 mr-1" title="Delete customer">
            <Trash2 size={18} />
          </button>
        )}
        <button onClick={handleSave} disabled={saving}
          className="bg-[var(--color-primary)] text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 hover:brightness-110 disabled:opacity-50 transition">
          <Save size={16} />{saving ? 'Saving...' : 'Save'}
        </button>
      </div>

      {/* Duplicate warning */}
      {isNew && dupeWarning.length > 0 && (
        <div className="bg-yellow-900/30 border border-yellow-700 rounded-lg p-4 mb-4">
          <p className="text-yellow-300 text-sm font-medium mb-2 flex items-center gap-2">
            <AlertTriangle size={16} />Possible duplicate detected
          </p>
          {dupeWarning.map((dw, i) => (
            <div key={i} className="flex items-center justify-between bg-[var(--color-bg)] rounded px-3 py-2 mb-1">
              <div>
                <span className="text-white text-sm">{dw.customer.name}</span>
                <span className="text-[var(--color-muted)] text-xs ml-2">
                  {dw.type === 'phone' ? `Phone: ${dw.customer.phone}` : `Similar name`}
                </span>
              </div>
              <button onClick={() => navigate(`/customers/${dw.customer.id}`)}
                className="text-[var(--color-primary)] text-xs hover:underline">View</button>
            </div>
          ))}
        </div>
      )}

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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
        <div className="bg-[var(--color-surface)] rounded-lg p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-[var(--color-muted)] flex items-center gap-2"><Car size={16} />Vehicles ({vehicles.length})</h2>
            <button onClick={handleAddVehicle} className="text-[var(--color-primary)] text-sm flex items-center gap-1 hover:underline"><Plus size={14} />Add Vehicle</button>
          </div>
          {vehicles.length === 0 ? (
            <p className="text-xs text-[var(--color-muted)]">No vehicles. Add one by VIN.</p>
          ) : (
            <div className="space-y-2">
              {vehicles.map((v: any) => (
                <div key={v.id} className="flex items-center justify-between bg-[var(--color-bg)] rounded-lg px-4 py-3 min-w-0">
                  <div className="min-w-0">
                    <div className="text-white text-sm font-medium">{v.year} {v.make} {v.model}</div>
                    <div className="text-[var(--color-muted)] text-xs truncate">VIN: {v.vin}</div>
                    {v.engine && <div className="text-[var(--color-muted)] text-xs">{v.engine}</div>}
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

      {/* Delete confirmation modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowDeleteConfirm(false)}>
          <div className="bg-[var(--color-surface)] rounded-lg p-6 max-w-sm w-full mx-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-white font-medium mb-2">
              {hasQbLink ? 'Archive Customer?' : 'Delete Customer?'}
            </h3>
            <p className="text-sm text-[var(--color-muted)] mb-4">
              {hasQbLink
                ? <>This customer is linked to QuickBooks. They'll be <span className="text-yellow-300">archived</span> (hidden from lists) but not permanently deleted, so QB data stays intact.</>
                : <>Are you sure you want to delete <span className="text-white">{customer.name}</span>? This can't be undone.</>
              }
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 rounded-lg text-sm text-[var(--color-muted)] hover:text-white transition">
                Cancel
              </button>
              <button onClick={handleDelete} disabled={deleting}
                className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-500 disabled:opacity-50 transition">
                {deleting ? (hasQbLink ? 'Archiving...' : 'Deleting...') : (hasQbLink ? 'Yes, Archive' : 'Yes, Delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
