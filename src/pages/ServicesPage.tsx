import { useState, useEffect } from 'react'
import { Plus, Trash2, Check, X, ChevronDown, ChevronRight, RefreshCw } from 'lucide-react'
import { getServices, saveService, deleteService } from '../lib/db'
import type { Service } from '../lib/db'
import { toast } from '../components/Toast'

const CATEGORIES = ['diagnostic', 'programming', 'adas', 'keys', 'fee', 'inventory', 'other'] as const
const CATEGORY_LABELS: Record<string, string> = {
  diagnostic: 'Diagnostic',
  programming: 'Programming',
  adas: 'ADAS',
  keys: 'Keys',
  fee: 'Fees',
  inventory: 'Inventory / Parts',
  other: 'Other',
}

const emptyForm = {
  name: '',
  description: '',
  category: 'other',
  default_rate: '',
  default_notes: '',
  is_active: true,
}

export default function ServicesPage() {
  const [services, setServices] = useState<Service[]>([])
  const [editing, setEditing] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ ...emptyForm })
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [deleteTargetName, setDeleteTargetName] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())

  useEffect(() => { loadServices() }, [])

  async function loadServices() {
    const data = await getServices(false)
    setServices(data)
  }

  function startEdit(svc: Service) {
    setForm({
      name: svc.name,
      description: svc.description || '',
      category: svc.category || 'other',
      default_rate: svc.default_rate?.toString() || '',
      default_notes: svc.default_notes || '',
      is_active: svc.is_active,
    })
    setEditing(svc.id)
    setAdding(false)
  }

  function startAdd() {
    setForm({ ...emptyForm })
    setEditing(null)
    setAdding(true)
  }

  function cancel() {
    setEditing(null)
    setAdding(false)
    setForm({ ...emptyForm })
  }

  async function handleSave(editId?: string) {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      await saveService({
        id: editId || undefined,
        name: form.name.trim(),
        description: form.description.trim() || null,
        category: form.category,
        default_rate: form.default_rate ? parseFloat(form.default_rate) : 0,
        default_notes: form.default_notes.trim() || null,
        is_active: form.is_active,
      })
      cancel()
      await loadServices()
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    await deleteService(deleteTarget)
    if (editing === deleteTarget) cancel()
    setDeleteTarget(null)
    setDeleteTargetName('')
    await loadServices()
  }

  function toggleGroup(cat: string) {
    setCollapsedGroups(prev => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })
  }

  async function handleQbSync() {
    setSyncing(true)
    try {
      const res = await fetch('/api/qb-sync-services', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Sync failed')
      let msg = `QB sync complete: ${data.inserted} new, ${data.updated} updated`
      if (data.errors?.length) msg += ` (${data.errors.length} errors)`
      toast(msg)
      await loadServices()
    } catch (err: any) {
      toast(`Sync failed: ${err.message}`)
    }
    setSyncing(false)
  }

  // Group services by category
  const grouped = CATEGORIES.reduce((acc, cat) => {
    const items = services.filter(s => (s.category || 'other') === cat)
    if (items.length > 0) acc.push({ category: cat, items })
    return acc
  }, [] as { category: string; items: Service[] }[])

  const inputClass = 'w-full bg-[var(--color-bg)] border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[var(--color-primary)] min-h-[44px]'
  const labelClass = 'block text-xs text-[var(--color-muted)] mb-1'

  function renderForm(editId?: string) {
    return (
      <div className="bg-[var(--color-surface)] rounded-lg p-4 mb-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Name *</label>
            <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Full Diagnostic Scan"
              className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Category</label>
            <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}
              className={inputClass}>
              {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className={labelClass}>Description</label>
          <input type="text" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
            placeholder="Brief description of the service"
            className={inputClass} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Default Rate ($)</label>
            <input type="number" inputMode="decimal" step="0.01" value={form.default_rate}
              onChange={e => setForm({ ...form, default_rate: e.target.value })}
              placeholder="0.00"
              className={inputClass} />
          </div>
          <div className="flex items-end">
            <button type="button" onClick={() => setForm({ ...form, is_active: !form.is_active })}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-lg min-h-[44px] text-sm font-medium transition ${
                form.is_active
                  ? 'bg-green-900/30 text-green-400 border border-green-700'
                  : 'bg-gray-800 text-gray-400 border border-gray-700'
              }`}>
              <div className={`w-10 h-6 rounded-full relative transition-colors ${form.is_active ? 'bg-green-500' : 'bg-gray-600'}`}>
                <div className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-all ${form.is_active ? 'left-[18px]' : 'left-0.5'}`} />
              </div>
              {form.is_active ? 'Active' : 'Inactive'}
            </button>
          </div>
        </div>

        <div>
          <label className={labelClass}>
            Default Notes <span className="text-[var(--color-primary)]">(pre-fills when added to a job)</span>
          </label>
          <textarea value={form.default_notes} onChange={e => setForm({ ...form, default_notes: e.target.value })}
                onInput={e => { const t = e.target as HTMLTextAreaElement; t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px' }}
                onFocus={e => { const t = e.target as HTMLTextAreaElement; t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px' }}
            placeholder="Notes that will automatically appear when this service is added to a job..."
            rows={4}
            className={`${inputClass} resize-none overflow-hidden`} />
        </div>

        <div className="flex gap-2 pt-1">
          <button onClick={() => handleSave(editId)} disabled={saving || !form.name.trim()}
            className="bg-[var(--color-primary)] text-white px-5 py-2.5 rounded-lg text-sm font-medium flex items-center gap-1.5 hover:brightness-110 transition min-h-[44px] disabled:opacity-50">
            <Check size={16} />{saving ? 'Saving...' : editing ? 'Update' : 'Add Service'}
          </button>
          <button onClick={cancel}
            className="bg-gray-700 text-white px-5 py-2.5 rounded-lg text-sm font-medium flex items-center gap-1.5 hover:bg-gray-600 transition min-h-[44px]">
            <X size={16} />Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold">Services</h1>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">Canned jobs &amp; service templates</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleQbSync} disabled={syncing}
            className="bg-[var(--color-surface)] text-[var(--color-muted)] hover:text-white px-4 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2 hover:brightness-110 transition min-h-[44px] disabled:opacity-50 border border-gray-700">
            <RefreshCw size={16} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Syncing...' : 'Sync from QB'}
          </button>
          <button onClick={startAdd}
            className="bg-[var(--color-primary)] text-white px-4 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2 hover:brightness-110 transition min-h-[44px]">
            <Plus size={16} />Add Service
          </button>
        </div>
      </div>

      {/* Add form at top */}
      {adding && renderForm()}

      {/* Grouped list */}
      {grouped.length === 0 && !adding && (
        <p className="text-[var(--color-muted)] text-sm text-center py-12">
          No services yet. Add your first one to get started.
        </p>
      )}

      {grouped.map(({ category, items }) => (
        <div key={category} className="mb-4">
          {/* Category header */}
          <button onClick={() => toggleGroup(category)}
            className="flex items-center gap-2 w-full text-left px-2 py-2 mb-1 min-h-[44px]">
            {collapsedGroups.has(category)
              ? <ChevronRight size={16} className="text-[var(--color-muted)]" />
              : <ChevronDown size={16} className="text-[var(--color-muted)]" />}
            <span className="text-sm font-semibold text-[var(--color-muted)] uppercase tracking-wider">
              {CATEGORY_LABELS[category] || category}
            </span>
            <span className="text-xs text-gray-600 ml-1">({items.length})</span>
          </button>

          {!collapsedGroups.has(category) && (
            <div className="space-y-2">
              {items.map(svc => (
                <div key={svc.id}>
                  {editing === svc.id ? (
                    renderForm(svc.id)
                  ) : (
                    <div
                      onClick={() => startEdit(svc)}
                      className="bg-[var(--color-surface)] rounded-lg px-4 py-3 flex items-center gap-3 cursor-pointer hover:brightness-110 transition active:scale-[0.99] min-h-[44px]"
                    >
                      {/* Active indicator */}
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${svc.is_active ? 'bg-green-500' : 'bg-gray-600'}`} />

                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2">
                          <span className={`text-sm font-medium truncate ${svc.is_active ? 'text-white' : 'text-gray-500'}`}>
                            {svc.name}
                          </span>
                          {!svc.is_active && (
                            <span className="text-[10px] text-gray-600 uppercase tracking-wide flex-shrink-0">inactive</span>
                          )}
                        </div>
                        {svc.description && (
                          <p className="text-xs text-[var(--color-muted)] truncate mt-0.5">{svc.description}</p>
                        )}
                      </div>

                      {svc.default_rate > 0 && (
                        <span className="text-sm text-[var(--color-muted)] flex-shrink-0 font-mono">
                          ${svc.default_rate.toFixed(2)}
                        </span>
                      )}

                      <button
                        onClick={e => { e.stopPropagation(); setDeleteTarget(svc.id); setDeleteTargetName(svc.name) }}
                        className="text-gray-600 hover:text-red-400 p-2 -mr-2 min-w-[44px] min-h-[44px] flex items-center justify-center flex-shrink-0"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => { setDeleteTarget(null); setDeleteTargetName('') }}>
          <div className="bg-[var(--color-surface)] rounded-lg p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-white font-medium mb-2">Delete Service</h3>
            <p className="text-[var(--color-muted)] text-sm mb-4">Are you sure you want to delete <span className="text-white">{deleteTargetName}</span>? This cannot be undone.</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => { setDeleteTarget(null); setDeleteTargetName('') }}
                className="px-4 py-2 rounded-lg text-sm text-[var(--color-muted)] hover:text-white transition min-h-[44px]">Cancel</button>
              <button onClick={confirmDelete}
                className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-500 transition min-h-[44px]">Yes, Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
