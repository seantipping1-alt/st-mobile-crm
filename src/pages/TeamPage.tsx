import { useState, useEffect } from 'react'
import { Plus, Trash2, Check, X } from 'lucide-react'
import { getTeam, saveTeamMember, deleteTeamMember } from '../lib/db'

const COLORS = ['#1FA0E5', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16', '#9CA3AF', '#F97316']
const ROLES = ['owner', 'admin', 'tech']

export default function TeamPage() {
  const [team, setTeam] = useState<any[]>([])
  const [editing, setEditing] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ name: '', role: 'tech', color: '#1FA0E5', phone: '', tools: '' })

  useEffect(() => { loadTeam() }, [])

  async function loadTeam() {
    const data = await getTeam()
    setTeam(data)
  }

  async function handleSave(editId?: string) {
    await saveTeamMember({
      id: editId || undefined,
      name: form.name,
      role: form.role,
      color: form.color,
      phone: form.phone || null,
      tools: form.tools ? form.tools.split(',').map((t) => t.trim()) : [],
    })
    setEditing(null)
    setAdding(false)
    setForm({ name: '', role: 'tech', color: '#1FA0E5', phone: '', tools: '' })
    loadTeam()
  }

  async function handleDelete(id: string) {
    if (!confirm('Remove this team member?')) return
    await deleteTeamMember(id)
    loadTeam()
  }

  function startEdit(member: any) {
    setForm({
      name: member.name,
      role: member.role,
      color: member.color,
      phone: member.phone || '',
      tools: (member.tools || []).join(', '),
    })
    setEditing(member.id)
    setAdding(false)
  }

  return (
    <div className="p-4 md:p-6 max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold">Team</h1>
        <button onClick={() => { setAdding(true); setEditing(null); setForm({ name: '', role: 'tech', color: '#1FA0E5', phone: '', tools: '' }) }}
          className="bg-[var(--color-primary)] text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 hover:brightness-110 transition">
          <Plus size={16} />Add Member
        </button>
      </div>

      {/* Add / Edit form */}
      {(adding || editing) && (
        <div className="bg-[var(--color-surface)] rounded-lg p-4 mb-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[var(--color-muted)] mb-1">Name</label>
              <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full bg-[var(--color-bg)] border border-gray-700 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-[var(--color-primary)]" />
            </div>
            <div>
              <label className="block text-xs text-[var(--color-muted)] mb-1">Role</label>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}
                className="w-full bg-[var(--color-bg)] border border-gray-700 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-[var(--color-primary)]">
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Phone</label>
            <input type="text" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="w-full bg-[var(--color-bg)] border border-gray-700 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-[var(--color-primary)]" />
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Tools (comma-separated)</label>
            <input type="text" value={form.tools} onChange={(e) => setForm({ ...form, tools: e.target.value })}
              placeholder="Autel MS908, Pico 4425" className="w-full bg-[var(--color-bg)] border border-gray-700 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-[var(--color-primary)]" />
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Color</label>
            <div className="flex flex-wrap gap-2">
              {COLORS.map((c) => (
                <button key={c} onClick={() => setForm({ ...form, color: c })}
                  className={`w-7 h-7 rounded-full border-2 transition ${form.color === c ? 'border-white scale-110' : 'border-transparent'}`}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={() => handleSave(editing || undefined)}
              className="bg-[var(--color-primary)] text-white px-4 py-1.5 rounded text-sm flex items-center gap-1.5 hover:brightness-110">
              <Check size={14} />{editing ? 'Update' : 'Add'}
            </button>
            <button onClick={() => { setEditing(null); setAdding(false) }}
              className="bg-gray-700 text-white px-4 py-1.5 rounded text-sm flex items-center gap-1.5 hover:bg-gray-600">
              <X size={14} />Cancel
            </button>
          </div>
        </div>
      )}

      {/* Team list */}
      <div className="space-y-2">
        {team.map((m) => (
          <div key={m.id} className="bg-[var(--color-surface)] rounded-lg px-4 py-3 flex items-center gap-3">
            <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: m.color }} />
            <div className="flex-1">
              <span className="text-white text-sm font-medium">{m.name}</span>
              <span className="text-[var(--color-muted)] text-xs ml-2 capitalize">{m.role}</span>
              {m.tools?.length > 0 && (
                <span className="text-[var(--color-muted)] text-xs ml-2">— {m.tools.join(', ')}</span>
              )}
            </div>
            <button onClick={() => startEdit(m)} className="text-[var(--color-primary)] text-xs hover:underline">Edit</button>
            {m.role !== 'owner' && (
              <button onClick={() => handleDelete(m.id)} className="text-gray-600 hover:text-red-400"><Trash2 size={14} /></button>
            )}
          </div>
        ))}
        {team.length === 0 && !adding && (
          <p className="text-[var(--color-muted)] text-sm text-center py-8">No team members yet. Add your first one.</p>
        )}
      </div>
    </div>
  )
}
