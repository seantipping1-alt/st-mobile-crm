import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Save } from 'lucide-react'
import { supabase } from '../lib/supabase'

const STATUSES = ['scheduled', 'in_progress', 'complete', 'invoiced', 'paid', 'cancelled']
const STATUS_LABELS: Record<string, string> = {
  scheduled: 'Scheduled', in_progress: 'In Progress', complete: 'Complete',
  invoiced: 'Invoiced', paid: 'Paid', cancelled: 'Cancelled'
}

export default function JobDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [job, setJob] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [findings, setFindings] = useState('')
  const [notes, setNotes] = useState('')

  useEffect(() => { loadJob() }, [id])

  async function loadJob() {
    const { data } = await supabase.from('jobs')
      .select('*, customers(name), vehicles(year,make,model,vin), team(name,color)')
      .eq('id', id).single()
    if (data) {
      setJob(data)
      setFindings(data.findings || '')
      setNotes(data.internal_notes || '')
    }
    setLoading(false)
  }

  async function updateStatus(status: string) {
    setSaving(true)
    const updates: any = { status }
    if (status === 'complete') updates.completed_at = new Date().toISOString()
    await supabase.from('jobs').update(updates).eq('id', id)
    setJob({ ...job, status })
    setSaving(false)
  }

  async function saveDetails() {
    setSaving(true)
    await supabase.from('jobs').update({
      findings,
      internal_notes: notes,
    }).eq('id', id)
    setSaving(false)
  }

  if (loading) return <div className="p-6 text-[var(--color-muted)]">Loading...</div>
  if (!job) return <div className="p-6 text-red-400">Job not found</div>

  const currentIdx = STATUSES.indexOf(job.status)

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => navigate('/jobs')} className="text-[var(--color-muted)] hover:text-white"><ArrowLeft size={20} /></button>
        <div>
          <h1 className="text-xl font-bold">{job.customers?.name || 'Unknown Customer'}</h1>
          <p className="text-xs text-[var(--color-muted)]">
            {job.vehicles ? `${job.vehicles.year} ${job.vehicles.make} ${job.vehicles.model}` : 'No vehicle'}
            {job.vehicles?.vin && <span className="ml-2 font-mono">VIN: {job.vehicles.vin}</span>}
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {/* Status flow */}
        <div className="bg-[var(--color-surface)] rounded-lg p-4">
          <label className="block text-xs text-[var(--color-muted)] mb-3">Status</label>
          <div className="flex gap-2">
            {STATUSES.map((s, i) => (
              <button key={s} onClick={() => updateStatus(s)} disabled={saving}
                className={`flex-1 py-2 rounded-lg text-xs font-medium transition ${
                  job.status === s
                    ? 'bg-[var(--color-primary)] text-white'
                    : i <= currentIdx
                    ? 'bg-green-900/30 text-green-400 hover:bg-green-900/50'
                    : 'bg-[var(--color-bg)] text-gray-600 hover:text-gray-400'
                }`}>
                {STATUS_LABELS[s]}
              </button>
            ))}
          </div>
        </div>

        {/* Job details */}
        <div className="bg-[var(--color-surface)] rounded-lg p-4">
          <div className="grid grid-cols-2 gap-3 text-sm mb-4">
            <div>
              <span className="text-xs text-[var(--color-muted)]">Job Type</span>
              <p className="text-white capitalize">{job.job_type}</p>
            </div>
            <div>
              <span className="text-xs text-[var(--color-muted)]">Assigned To</span>
              <p style={{ color: job.team?.color || 'white' }}>{job.team?.name || 'Unassigned'}</p>
            </div>
            <div>
              <span className="text-xs text-[var(--color-muted)]">Priority</span>
              <p className="text-white capitalize">{job.priority}</p>
            </div>
            <div>
              <span className="text-xs text-[var(--color-muted)]">Shop RO #</span>
              <p className="text-white">{job.shop_ro_number || '—'}</p>
            </div>
          </div>

          {job.problem_description && (
            <div className="mb-3">
              <span className="text-xs text-[var(--color-muted)]">Job Description</span>
              <p className="text-white text-sm mt-0.5 whitespace-pre-wrap">{job.problem_description}</p>
            </div>
          )}

          {/* Findings */}
          <div className="mb-3">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Findings</label>
            <textarea value={findings} onChange={(e) => setFindings(e.target.value)} rows={3}
              placeholder="What did the tech find?"
              className="w-full bg-[var(--color-bg)] border border-gray-700 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-[var(--color-primary)] resize-none" />
          </div>

          {/* Internal notes */}
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Internal Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
              className="w-full bg-[var(--color-bg)] border border-gray-700 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-[var(--color-primary)] resize-none" />
          </div>

          <button onClick={saveDetails} disabled={saving}
            className="mt-3 bg-[var(--color-primary)] text-white px-4 py-1.5 rounded text-sm flex items-center gap-1.5 hover:brightness-110 transition">
            <Save size={14} />Save Details
          </button>
        </div>

        {/* Attachments — placeholder */}
        <div className="bg-[var(--color-surface)] rounded-lg p-4">
          <h3 className="text-sm font-medium text-[var(--color-muted)] mb-2">Attachments</h3>
          <p className="text-xs text-[var(--color-muted)]">Scan reports and photos — coming in Phase 4.</p>
        </div>
      </div>
    </div>
  )
}
