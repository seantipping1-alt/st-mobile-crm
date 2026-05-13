import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, Search, AlertTriangle } from 'lucide-react'
import { getCustomers, type Customer } from '../lib/db'

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    loadCustomers()
  }, [])

  async function loadCustomers(q?: string) {
    setLoading(true)
    try {
      const data = await getCustomers(q)
      setCustomers(data)
    } catch (err) {
      console.error('Failed to load customers', err)
    }
    setLoading(false)
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    loadCustomers(search)
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold">Customers</h1>
        <button
          onClick={() => navigate('/customers/new')}
          className="bg-[var(--color-primary)] text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 hover:brightness-110 transition"
        >
          <Plus size={16} />
          Add Customer
        </button>
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="mb-4">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, phone, or email..."
            className="w-full bg-[var(--color-surface)] border border-gray-700 rounded-lg pl-10 pr-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[var(--color-primary)]"
          />
        </div>
      </form>

      {/* Customer list */}
      <div className="bg-[var(--color-surface)] rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-[var(--color-muted)] text-sm">Loading...</div>
        ) : customers.length === 0 ? (
          <div className="p-8 text-center text-[var(--color-muted)] text-sm">
            {search ? 'No customers match your search.' : 'No customers yet. Add your first one.'}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-left">
                <th className="px-4 py-3 text-[var(--color-muted)] font-medium text-xs">Name</th>
                <th className="px-4 py-3 text-[var(--color-muted)] font-medium text-xs">Phone</th>
                <th className="px-4 py-3 text-[var(--color-muted)] font-medium text-xs">Email</th>
                <th className="px-4 py-3 text-[var(--color-muted)] font-medium text-xs text-right">Spend</th>
                <th className="px-4 py-3 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => navigate(`/customers/${c.id}`)}
                  className="border-b border-gray-800/50 hover:bg-white/5 cursor-pointer transition"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {c.red_flag && <AlertTriangle size={14} className="text-red-400 flex-shrink-0" />}
                      <span className="text-white">{c.name}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${c.customer_type === 'shop' ? 'bg-blue-900/50 text-blue-300' : 'bg-gray-700 text-gray-300'}`}>
                        {c.customer_type === 'shop' ? 'Shop' : 'Individual'}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[var(--color-muted)]">{c.phone || '—'}</td>
                  <td className="px-4 py-3 text-[var(--color-muted)]">{c.email || '—'}</td>
                  <td className="px-4 py-3 text-right text-white font-medium">
                    {c.total_spend > 0 ? `$${c.total_spend.toLocaleString()}` : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <Link to={`/customers/${c.id}`} className="text-[var(--color-primary)] hover:underline text-xs">Edit</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
