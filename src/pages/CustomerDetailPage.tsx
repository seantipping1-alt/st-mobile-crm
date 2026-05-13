import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Save, AlertTriangle, Car, Plus, Trash2 } from 'lucide-react'
import { getCustomer, saveCustomer, getVehiclesByCustomer, saveVehicle, type Customer } from '../lib/db'

export default function CustomerDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isNew = id === 'new'

  const [customer, setCustomer] = useState<Partial<Customer>>({
    name: '',
    phone: '',
    email: '',
    address: '',
    notes: '',
    red_flag: false,
    red_flag_reason: '',
    discount_percent: 0,
  })
  const [vehicles, setVehicles] = useState<any[]>([])
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(!isNew)

  useEffect(() => {
    if (!isNew && id) {
      loadCustomer(id)
    }
  }, [id])

  async function loadCustomer(customerId: string) {
    try {
      const c = await getCustomer(customerId)
      setCustomer(c)
      const v = await getVehiclesByCustomer(customerId)
      setVehicles(v)
    } catch (err) {
      console.error('Failed to load', err)
    }
    setLoading(false)
  }

  async function handleSave() {
    setSaving(true)
    try {
      const saved = await saveCustomer(customer)
      navigate(`/customers/${saved.id}`, { replace: true })
    } catch (err) {
      console.error('Failed to save', err)
    }
    setSaving(false)
  }

  async function handleAddVehicle() {
    const vin = prompt('Enter VIN:')
    if (!vin) return
    try {
      // Basic NHTSA VIN decode
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
      console.error('Failed to add vehicle', err)
      alert('Failed to decode VIN. Try again.')
    }
  }

  function setField(field: string, value: any) {
    setCustomer((prev) => ({ ...prev, [field]: value }))
  }

  if (loading) {
    return <div className="p-6 text-[var(--color-muted)]">Loading...</div>
  }

  return (
    <div className="p-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => navigate('/customers')} className="text-[var(--color-muted)] hover:text-white">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-xl font-bold">{isNew ? 'New Customer' : customer.name}</h1>
        <div className="flex-1" />
        <button
          onClick={handleSave}
          disabled={saving || !customer.name}
          className="bg-[var(--color-primary)] text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 hover:brightness-110 disabled:opacity-50 transition"
        >
          <Save size={16} />
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>

      {/* Form */}
      <div className="bg-[var(--color-surface)] rounded-lg p-6 space-y-4 mb-6">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Name *</label>
            <input
              type="text"
              value={customer.name}
              onChange={(e) => setField('name', e.target.value)}
              className="w-full bg-[var(--color-bg)] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[var(--color-primary)]"
              placeholder="Shop name or customer name"
            />
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Phone</label>
            <input
              type="text"
              value={customer.phone || ''}
              onChange={(e) => setField('phone', e.target.value)}
              className="w-full bg-[var(--color-bg)] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[var(--color-primary)]"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Email</label>
            <input
              type="email"
              value={customer.email || ''}
              onChange={(e) => setField('email', e.target.value)}
              className="w-full bg-[var(--color-bg)] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[var(--color-primary)]"
            />
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Discount %</label>
            <input
              type="number"
              min="0"
              max="100"
              value={customer.discount_percent || 0}
              onChange={(e) => setField('discount_percent', parseFloat(e.target.value) || 0)}
              className="w-full bg-[var(--color-bg)] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[var(--color-primary)]"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs text-[var(--color-muted)] mb-1">Address</label>
          <input
            type="text"
            value={customer.address || ''}
            onChange={(e) => setField('address', e.target.value)}
            className="w-full bg-[var(--color-bg)] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[var(--color-primary)]"
          />
        </div>

        <div>
          <label className="block text-xs text-[var(--color-muted)] mb-1">Notes</label>
          <textarea
            value={customer.notes || ''}
            onChange={(e) => setField('notes', e.target.value)}
            rows={3}
            className="w-full bg-[var(--color-bg)] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[var(--color-primary)] resize-none"
          />
        </div>

        {/* Red flag */}
        <div className="flex items-center gap-3 pt-2 border-t border-gray-800">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={customer.red_flag || false}
              onChange={(e) => setField('red_flag', e.target.checked)}
              className="rounded"
            />
            <span className="text-sm text-red-400 flex items-center gap-1">
              <AlertTriangle size={14} />
              Red Flag
            </span>
          </label>
          {customer.red_flag && (
            <input
              type="text"
              value={customer.red_flag_reason || ''}
              onChange={(e) => setField('red_flag_reason', e.target.value)}
              placeholder="Reason for flag..."
              className="flex-1 bg-[var(--color-bg)] border border-gray-700 rounded-lg px-3 py-1 text-white text-sm focus:outline-none focus:border-red-500"
            />
          )}
        </div>
      </div>

      {/* Vehicles section — only for existing customers */}
      {!isNew && (
        <div className="bg-[var(--color-surface)] rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-[var(--color-muted)] flex items-center gap-2">
              <Car size={16} />
              Vehicles ({vehicles.length})
            </h2>
            <button
              onClick={handleAddVehicle}
              className="text-[var(--color-primary)] text-sm flex items-center gap-1 hover:underline"
            >
              <Plus size={14} />
              Add Vehicle
            </button>
          </div>

          {vehicles.length === 0 ? (
            <p className="text-xs text-[var(--color-muted)]">No vehicles. Add one by VIN.</p>
          ) : (
            <div className="space-y-2">
              {vehicles.map((v: any) => (
                <div key={v.id} className="flex items-center justify-between bg-[var(--color-bg)] rounded-lg px-4 py-3">
                  <div>
                    <span className="text-white text-sm font-medium">
                      {v.year} {v.make} {v.model}
                    </span>
                    <span className="text-[var(--color-muted)] text-xs ml-3">
                      VIN: {v.vin}
                    </span>
                    {v.engine && <span className="text-[var(--color-muted)] text-xs ml-3">{v.engine}</span>}
                  </div>
                  <button className="text-gray-600 hover:text-red-400">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
