import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Save, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { deleteJob, getJobLineItems } from '../lib/db'

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
  const [lineItems, setLineItems] = useState<any[]>([])
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => { loadJob() }, [id])

  async function loadJob() {
    const { data, error } = await supabase.from('jobs')
      .select('*, customers(name), vehicles(year,make,model,vin)')
      .eq('id', id).single()
    if (error) { console.error('loadJob error', error) }
    if (data) {
      // Fetch team member separately to avoid embedding ambiguity
      let team = null
      if (data.assigned_to) {
        const { data: teamData } = await supabase.from('team')
          .select('name,color').eq('id', data.assigned_to).single()
        team = teamData
      }
      setJob({ ...data, team })
      setFindings(data.findings || '')
      setNotes(data.internal_notes || '')
      // Load line items
      try {
        const items = await getJobLineItems(data.id)
        setLineItems(items)
      } catch (_) {}
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

  async function handleDelete() {
    if (!id) return
    setDeleting(true)
    try {
      await deleteJob(id)
      navigate('/jobs')
    } catch (err) {
      console.error(err)
      setDeleting(false)
      setShowDeleteConfirm(false)
    }
  }

  if (loading) return <div className="p-6 text-[var(--color-muted)]">Loading...</div>
  if (!job) return <div className="p-6 text-red-400">Job not found</div>

  const currentIdx = STATUSES.indexOf(job.status)

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => navigate('/jobs')} className="text-[var(--color-muted)] hover:text-white"><ArrowLeft size={20} /></button>
        <div className="flex-1">
          <h1 className="text-xl font-bold">{job.customers?.name || 'Unknown Customer'}</h1>
          <p className="text-xs text-[var(--color-muted)]">
            {job.vehicles ? `${job.vehicles.year} ${job.vehicles.make} ${job.vehicles.model}` : 'No vehicle'}
            {job.vehicles?.vin && <span className="ml-2 font-mono">VIN: {job.vehicles.vin}</span>}
          </p>
        </div>
        <button onClick={() => setShowDeleteConfirm(true)}
          className="text-gray-500 hover:text-red-400 transition p-2" title="Delete job">
          <Trash2 size={18} />
        </button>
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

          {/* Line items / services */}
          {lineItems.length > 0 && (
            <div className="mb-3">
              <span className="text-xs text-[var(--color-muted)]">Services</span>
              <div className="mt-1 space-y-1">
                {lineItems.map((li: any) => (
                  <div key={li.id} className="flex items-center justify-between bg-[var(--color-bg)] rounded px-3 py-2 text-sm">
                    <div>
                      <span className="text-white">{li.description}</span>
                      {li.quantity > 1 && <span className="text-[var(--color-muted)] ml-2">×{li.quantity}</span>}
                    </div>
                    {li.unit_price > 0 && (
                      <span className="text-white font-medium">
                        ${(li.quantity * li.unit_price).toFixed(2)}
                      </span>
                    )}
                  </div>
                ))}
                {lineItems.some((li: any) => li.unit_price > 0) && (
                  <div className="flex justify-end px-3 pt-1 border-t border-gray-800">
                    <span className="text-xs text-[var(--color-muted)]">Total: </span>
                    <span className="text-sm text-white font-medium ml-1">
                      ${lineItems.reduce((sum: number, li: any) => sum + (li.quantity * li.unit_price), 0).toFixed(2)}
                    </span>
                  </div>
                )}
              </div>
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

      {/* Delete confirmation modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowDeleteConfirm(false)}>
          <div className="bg-[var(--color-surface)] rounded-lg p-6 max-w-sm w-full mx-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-white font-medium mb-2">Delete Job?</h3>
            <p className="text-sm text-[var(--color-muted)] mb-4">
              Are you sure you want to delete this job for <span className="text-white">{job.customers?.name || 'Unknown'}</span>
              {job.vehicles && ` (${job.vehicles.year} ${job.vehicles.make} ${job.vehicles.model})`}?
              This can't be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 rounded-lg text-sm text-[var(--color-muted)] hover:text-white transition">
                No, Keep It
              </button>
              <button onClick={handleDelete} disabled={deleting}
                className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-500 disabled:opacity-50 transition">
                {deleting ? 'Deleting...' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
