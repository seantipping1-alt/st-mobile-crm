import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, AlertTriangle, Trash2, RefreshCw } from 'lucide-react'
import { getCustomers, deleteCustomer, type Customer } from '../lib/db'
import { toast } from '../components/Toast'

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [syncing, setSyncing] = useState(false)
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

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const hasQbLink = !!deleteTarget.qb_id
      await deleteCustomer(deleteTarget.id, hasQbLink)
      setCustomers(customers.filter((c) => c.id !== deleteTarget.id))
    } catch (err) { console.error(err) }
    setDeleting(false)
    setDeleteTarget(null)
  }

  async function handleQbSync() {
    setSyncing(true)
    try {
      const res = await fetch('/api/qb-sync-customers', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Sync failed')
      toast(`QB sync complete: ${data.inserted} new, ${data.updated} updated`)
      await loadCustomers(search)
    } catch (err: any) {
      toast(`Sync failed: ${err.message}`)
    }
    setSyncing(false)
  }

  return (
    <div className="p-4 md:p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold">Customers</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={handleQbSync}
            disabled={syncing}
            className="bg-[var(--color-surface)] text-[var(--color-muted)] hover:text-white px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 hover:brightness-110 transition disabled:opacity-50 min-h-[44px]"
          >
            <RefreshCw size={16} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Syncing...' : 'QB Sync'}
          </button>
          <button
            onClick={() => navigate('/customers/new')}
            className="bg-[var(--color-primary)] text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 hover:brightness-110 transition min-h-[44px]"
          >
            <Plus size={16} />
            Add Customer
          </button>
        </div>
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
      {loading ? (
        <div className="bg-[var(--color-surface)] rounded-lg p-8 text-center text-[var(--color-muted)] text-sm">Loading...</div>
      ) : customers.length === 0 ? (
        <div className="bg-[var(--color-surface)] rounded-lg p-8 text-center text-[var(--color-muted)] text-sm">
          {search ? 'No customers match your search.' : 'No customers yet. Add your first one.'}
        </div>
      ) : (
        <>
          {/* Desktop table (md+) */}
          <div className="hidden md:block bg-[var(--color-surface)] rounded-lg overflow-hidden">
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
                      <button onClick={(e) => { e.stopPropagation(); setDeleteTarget(c) }}
                        className="text-gray-600 hover:text-red-400 transition p-1" title="Delete customer">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile card list (< md) */}
          <div className="md:hidden space-y-2">
            {customers.map((c) => (
              <div
                key={c.id}
                onClick={() => navigate(`/customers/${c.id}`)}
                className="bg-[var(--color-surface)] rounded-lg p-4 active:bg-white/5 cursor-pointer transition"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    {/* Name row */}
                    <div className="flex items-center gap-2 mb-1">
                      {c.red_flag && <AlertTriangle size={14} className="text-red-400 flex-shrink-0" />}
                      <span className="text-white font-medium truncate">{c.name}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded flex-shrink-0 ${c.customer_type === 'shop' ? 'bg-blue-900/50 text-blue-300' : 'bg-gray-700 text-gray-300'}`}>
                        {c.customer_type === 'shop' ? 'Shop' : 'Individual'}
                      </span>
                    </div>
                    {/* Contact details */}
                    <div className="text-xs text-[var(--color-muted)] space-y-0.5">
                      {c.phone && <div>{c.phone}</div>}
                      {c.email && <div className="truncate">{c.email}</div>}
                    </div>
                  </div>
                  {/* Right side: spend + delete */}
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <span className="text-white font-medium text-sm">
                      {c.total_spend > 0 ? `$${c.total_spend.toLocaleString()}` : '—'}
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeleteTarget(c) }}
                      className="text-gray-600 hover:text-red-400 active:text-red-400 transition p-2 -mr-2 min-h-[44px] min-w-[44px] flex items-center justify-center"
                      title="Delete customer"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setDeleteTarget(null)}>
          <div className="bg-[var(--color-surface)] rounded-lg p-6 max-w-sm w-full mx-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-white font-medium mb-2">
              {deleteTarget.qb_id ? 'Archive Customer?' : 'Delete Customer?'}
            </h3>
            <p className="text-sm text-[var(--color-muted)] mb-4">
              {deleteTarget.qb_id
                ? <>This customer is linked to QuickBooks. <span className="text-white">{deleteTarget.name}</span> will be <span className="text-yellow-300">archived</span> but not permanently deleted.</>
                : <>Are you sure you want to delete <span className="text-white">{deleteTarget.name}</span>? This can't be undone.</>
              }
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 rounded-lg text-sm text-[var(--color-muted)] hover:text-white transition">
                Cancel
              </button>
              <button onClick={handleDelete} disabled={deleting}
                className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-500 disabled:opacity-50 transition">
                {deleting ? 'Deleting...' : (deleteTarget.qb_id ? 'Yes, Archive' : 'Yes, Delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
