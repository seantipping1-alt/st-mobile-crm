import { useState, useEffect } from 'react'
import { Plus, Trash2, Check, X, Phone, RefreshCw, ExternalLink, Plug, CheckCircle, XCircle, AlertCircle } from 'lucide-react'
import { getTeam, saveTeamMember, deleteTeamMember } from '../lib/db'
import { useAuth } from '../contexts/AuthContext'

const COLORS = ['#1FA0E5', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16', '#9CA3AF', '#F97316']
const ROLES = ['owner', 'admin', 'tech']

type ConnectionStatus = 'loading' | 'connected' | 'disconnected' | 'error'

interface CompanyInfo {
  companyName: string
  realmId: string
}

export default function SettingsPage() {
  const { signOut } = useAuth()

  // Team state
  const [team, setTeam] = useState<any[]>([])
  const [deleteTarget, setDeleteTarget] = useState<any>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ name: '', role: 'tech', color: '#1FA0E5', phone: '', tools: '' })

  // QB state
  const [status, setStatus] = useState<ConnectionStatus>('loading')
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null)
  const [testing, setTesting] = useState(false)
  const [justConnected, setJustConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadTeam()
    const params = new URLSearchParams(window.location.search)
    if (params.get('qb') === 'connected') {
      setJustConnected(true)
      window.history.replaceState({}, '', window.location.pathname)
    }
    checkConnection()
  }, [])

  // Team functions
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

  async function handleDelete() {
    if (!deleteTarget) return
    await deleteTeamMember(deleteTarget.id)
    setDeleteTarget(null)
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

  // QB functions
  async function checkConnection() {
    setStatus('loading')
    setError(null)
    try {
      const res = await fetch('/.netlify/functions/qb-api?path=companyinfo')
      if (!res.ok) {
        if (res.status === 401 || res.status === 404) {
          setStatus('disconnected')
          return
        }
        throw new Error(`HTTP ${res.status}`)
      }
      const data = await res.json()
      if (data.CompanyInfoResponse?.CompanyInfo || data.CompanyInfo) {
        const info = data.CompanyInfoResponse?.CompanyInfo || data.CompanyInfo
        setCompanyInfo({
          companyName: info.CompanyName || 'Unknown',
          realmId: data._realmId || '',
        })
        setStatus('connected')
      } else if (data.error) {
        setStatus('disconnected')
        setError(data.error)
      } else {
        setStatus('disconnected')
      }
    } catch (err: any) {
      setStatus('error')
      setError(err.message || 'Failed to check connection')
    }
  }

  async function testConnection() {
    setTesting(true)
    await checkConnection()
    setTesting(false)
  }

  return (
    <div className="p-4 md:p-6 max-w-2xl">
      <h1 className="text-xl font-bold mb-6">Settings</h1>

      {/* ── Team Section ── */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-white">Team</h2>
          <button onClick={() => { setAdding(true); setEditing(null); setForm({ name: '', role: 'tech', color: '#1FA0E5', phone: '', tools: '' }) }}
            className="bg-[var(--color-primary)] text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 hover:brightness-110 transition min-h-[44px]">
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
                  className="w-full bg-[var(--color-bg)] border border-gray-700 rounded px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[var(--color-primary)] min-h-[44px]" />
              </div>
              <div>
                <label className="block text-xs text-[var(--color-muted)] mb-1">Role</label>
                <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}
                  className="w-full bg-[var(--color-bg)] border border-gray-700 rounded px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[var(--color-primary)] min-h-[44px]">
                  {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs text-[var(--color-muted)] mb-1">Phone</label>
              <input type="text" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full bg-[var(--color-bg)] border border-gray-700 rounded px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[var(--color-primary)] min-h-[44px]" />
            </div>
            <div>
              <label className="block text-xs text-[var(--color-muted)] mb-1">Tools (comma-separated)</label>
              <input type="text" value={form.tools} onChange={(e) => setForm({ ...form, tools: e.target.value })}
                placeholder="Autel MS908, Pico 4425" className="w-full bg-[var(--color-bg)] border border-gray-700 rounded px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[var(--color-primary)] min-h-[44px]" />
            </div>
            <div>
              <label className="block text-xs text-[var(--color-muted)] mb-1">Color</label>
              <div className="flex flex-wrap gap-2">
                {COLORS.map((c) => (
                  <button key={c} onClick={() => setForm({ ...form, color: c })}
                    className={`w-8 h-8 rounded-full border-2 transition ${form.color === c ? 'border-white scale-110' : 'border-transparent'}`}
                    style={{ backgroundColor: c }} />
                ))}
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => handleSave(editing || undefined)}
                className="bg-[var(--color-primary)] text-white px-4 py-2.5 rounded text-sm flex items-center gap-1.5 hover:brightness-110 min-h-[44px]">
                <Check size={14} />{editing ? 'Update' : 'Add'}
              </button>
              <button onClick={() => { setEditing(null); setAdding(false) }}
                className="bg-gray-700 text-white px-4 py-2.5 rounded text-sm flex items-center gap-1.5 hover:bg-gray-600 min-h-[44px]">
                <X size={14} />Cancel
              </button>
            </div>
          </div>
        )}

        {/* Team list */}
        <div className="space-y-2">
          {team.map((m) => (
            <div key={m.id} className="bg-[var(--color-surface)] rounded-lg px-4 py-3 flex items-center gap-3 min-h-[48px]">
              <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: m.color }} />
              <div className="flex-1">
                <span className="text-white text-sm font-medium">{m.name}</span>
                <span className="text-[var(--color-muted)] text-xs ml-2 capitalize">{m.role}</span>
                {m.phone && (
                  <a href={`tel:${m.phone}`} className="inline-flex items-center gap-1 text-[var(--color-muted)] text-xs ml-2 hover:text-[var(--color-primary)] transition">
                    <Phone size={11} />{m.phone}
                  </a>
                )}
                {m.tools?.length > 0 && (
                  <span className="text-[var(--color-muted)] text-xs ml-2">— {m.tools.join(', ')}</span>
                )}
              </div>
              <button onClick={() => startEdit(m)} className="text-[var(--color-primary)] text-xs hover:underline min-h-[44px] flex items-center">Edit</button>
              {m.role !== 'owner' && (
                <button onClick={() => setDeleteTarget(m)} className="text-gray-600 hover:text-red-400 min-h-[44px] min-w-[44px] flex items-center justify-center"><Trash2 size={14} /></button>
              )}
            </div>
          ))}
          {team.length === 0 && !adding && (
            <p className="text-[var(--color-muted)] text-sm text-center py-8">No team members yet. Add your first one.</p>
          )}
        </div>
      </div>

      {/* ── QuickBooks Connection Section ── */}
      <div className="mb-8">
        <div className="bg-[var(--color-surface)] rounded-xl border border-gray-800 overflow-hidden">
          <div className="p-4 border-b border-gray-800">
            <div className="flex items-center gap-2">
              <Plug size={18} className="text-[var(--color-primary)]" />
              <h2 className="text-base font-semibold text-white">QuickBooks Connection</h2>
            </div>
          </div>

          <div className="p-4 space-y-4">
            {justConnected && status === 'connected' && (
              <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/30 text-green-400 rounded-lg p-3 text-sm">
                <CheckCircle size={16} />
                <span>Successfully connected to QuickBooks!</span>
              </div>
            )}

            {status === 'loading' && (
              <div className="flex items-center gap-3 py-4">
                <div className="animate-spin w-5 h-5 border-2 border-[var(--color-primary)] border-t-transparent rounded-full" />
                <span className="text-[var(--color-muted)] text-sm">Checking connection...</span>
              </div>
            )}

            {status === 'connected' && companyInfo && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse" />
                  <span className="text-green-400 text-sm font-medium">Connected</span>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-3 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-[var(--color-muted)] text-sm">Company</span>
                    <span className="text-white text-sm font-medium">{companyInfo.companyName}</span>
                  </div>
                  {companyInfo.realmId && (
                    <div className="flex justify-between items-center">
                      <span className="text-[var(--color-muted)] text-sm">Realm ID</span>
                      <span className="text-white text-sm font-mono">{companyInfo.realmId}</span>
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <button onClick={testConnection} disabled={testing}
                    className="flex items-center gap-2 px-3 py-2.5 bg-gray-800 hover:bg-gray-700 text-white text-sm rounded-lg transition disabled:opacity-50 min-h-[44px]">
                    <RefreshCw size={14} className={testing ? 'animate-spin' : ''} />
                    {testing ? 'Testing...' : 'Test Connection'}
                  </button>
                  <button disabled
                    className="flex items-center gap-2 px-3 py-2.5 text-red-400/50 text-sm rounded-lg border border-gray-800 cursor-not-allowed min-h-[44px]"
                    title="Coming soon">
                    Disconnect
                  </button>
                </div>
              </div>
            )}

            {status === 'disconnected' && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 bg-gray-500 rounded-full" />
                  <span className="text-[var(--color-muted)] text-sm">Not connected</span>
                </div>
                <p className="text-[var(--color-muted)] text-sm">
                  Connect your QuickBooks Online account to sync customers, invoices, and payments.
                </p>
                <a href="/.netlify/functions/qb-auth"
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#2CA01C] hover:bg-[#249016] text-white text-sm font-medium rounded-lg transition min-h-[44px]">
                  <ExternalLink size={14} />
                  Connect to QuickBooks
                </a>
              </div>
            )}

            {status === 'error' && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-red-400">
                  <XCircle size={16} />
                  <span className="text-sm">Connection error</span>
                </div>
                {error && (
                  <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg p-3 text-sm">
                    <AlertCircle size={14} className="mt-0.5 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}
                <div className="flex gap-2">
                  <button onClick={checkConnection}
                    className="flex items-center gap-2 px-3 py-2.5 bg-gray-800 hover:bg-gray-700 text-white text-sm rounded-lg transition min-h-[44px]">
                    <RefreshCw size={14} />
                    Retry
                  </button>
                  <a href="/.netlify/functions/qb-auth"
                    className="inline-flex items-center gap-2 px-3 py-2.5 bg-[#2CA01C] hover:bg-[#249016] text-white text-sm rounded-lg transition min-h-[44px]">
                    <ExternalLink size={14} />
                    Reconnect
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Sign Out ── */}
      <button
        onClick={signOut}
        className="w-full bg-[var(--color-surface)] text-red-400 hover:text-red-300 hover:bg-[var(--color-surface-hover)] rounded-lg py-3 text-sm font-medium transition min-h-[44px]"
      >
        Sign Out
      </button>

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setDeleteTarget(null)}>
          <div className="bg-[var(--color-surface)] rounded-lg p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-white font-medium mb-2">Remove Team Member</h3>
            <p className="text-[var(--color-muted)] text-sm mb-4">Are you sure you want to remove <span className="text-white">{deleteTarget.name}</span>?</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 rounded-lg text-sm text-[var(--color-muted)] hover:text-white transition min-h-[44px]">Cancel</button>
              <button onClick={handleDelete}
                className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-500 transition min-h-[44px]">Yes, Remove</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
