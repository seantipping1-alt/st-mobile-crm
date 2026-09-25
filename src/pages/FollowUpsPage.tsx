import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { toast } from '../components/Toast'

const PRIORITY_COLORS: Record<string, string> = {
  high: 'bg-red-900/40 text-red-300 border-red-800',
  low: 'bg-amber-900/40 text-amber-300 border-amber-800',
  nice_to_know: 'bg-blue-900/40 text-blue-300 border-blue-800',
}

const PRIORITY_LABELS: Record<string, string> = {
  high: 'High',
  low: 'Low',
  nice_to_know: 'Nice to Know',
}

function timeAgo(dateStr: string) {
  const now = new Date()
  const date = new Date(dateStr)
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  if (diffMins < 60) return `${diffMins}m ago`
  const diffHrs = Math.floor(diffMins / 60)
  if (diffHrs < 24) return `${diffHrs}h ago`
  const diffDays = Math.floor(diffHrs / 24)
  if (diffDays < 30) return `${diffDays}d ago`
  return `${Math.floor(diffDays / 30)}mo ago`
}

export default function FollowUpsPage() {
  const [followUps, setFollowUps] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<'open' | 'closed'>('open')
  const [resolveTarget, setResolveTarget] = useState<any>(null)
  const [closedNote, setClosedNote] = useState('')
  const [resolving, setResolving] = useState(false)
  const navigate = useNavigate()
  const { user } = useAuth()

  useEffect(() => { loadFollowUps() }, [viewMode])

  async function loadFollowUps() {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('follow_ups')
        .select('*, jobs(shop_name, job_type, customer_id, customers(name))')
        .eq('status', viewMode === 'open' ? 'open' : 'closed')
        .order('created_at', { ascending: false })

      if (error) throw error

      // Fetch vehicles for each job
      if (data && data.length > 0) {
        const jobIds = [...new Set(data.map((f: any) => f.job_id).filter(Boolean))]
        const { data: jvData } = await supabase
          .from('job_vehicles')
          .select('job_id, vehicles(year, make, model)')
          .in('job_id', jobIds)

        const vehicleMap: Record<string, any[]> = {}
        ;(jvData || []).forEach((jv: any) => {
          if (!vehicleMap[jv.job_id]) vehicleMap[jv.job_id] = []
          if (jv.vehicles) vehicleMap[jv.job_id].push(jv.vehicles)
        })

        setFollowUps(data.map((f: any) => ({
          ...f,
          vehicles: vehicleMap[f.job_id] || [],
        })))
      } else {
        setFollowUps([])
      }
    } catch (err) {
      console.error('loadFollowUps error', err)
    }
    setLoading(false)
  }

  async function resolveFollowUp() {
    if (!resolveTarget || !user) return
    setResolving(true)
    const { error } = await supabase.from('follow_ups').update({
      status: 'closed',
      closed_by: user.id,
      closed_at: new Date().toISOString(),
      closed_note: closedNote.trim() || null,
    }).eq('id', resolveTarget.id)

    if (error) {
      toast('Failed to resolve follow-up')
    } else {
      toast('Follow-up resolved ✓')
      setFollowUps(followUps.filter((f: any) => f.id !== resolveTarget.id))
    }
    setResolving(false)
    setResolveTarget(null)
    setClosedNote('')
  }

  return (
    <div className="p-4 md:p-6 max-w-2xl">
      <h1 className="text-xl font-bold mb-4">Follow-Ups</h1>

      {/* Toggle open/closed */}
      <div className="flex gap-1 mb-4 bg-[var(--color-surface)] rounded-lg p-1 w-fit">
        <button
          onClick={() => setViewMode('open')}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${
            viewMode === 'open'
              ? 'bg-[var(--color-primary)] text-white'
              : 'text-[var(--color-muted)] hover:text-white'
          }`}
        >
          Open
        </button>
        <button
          onClick={() => setViewMode('closed')}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${
            viewMode === 'closed'
              ? 'bg-[var(--color-primary)] text-white'
              : 'text-[var(--color-muted)] hover:text-white'
          }`}
        >
          Closed
        </button>
      </div>

      {loading ? (
        <div className="bg-[var(--color-surface)] rounded-lg p-8 text-center text-[var(--color-muted)] text-sm">Loading...</div>
      ) : followUps.length === 0 ? (
        <div className="bg-[var(--color-surface)] rounded-lg p-8 text-center text-[var(--color-muted)] text-sm">
          {viewMode === 'open' ? 'No open follow-ups.' : 'No closed follow-ups.'}
        </div>
      ) : (
        <div className="space-y-3">
          {followUps.map((fu: any) => {
            const customerName = fu.jobs?.customers?.name || fu.jobs?.shop_name || '—'
            const vehicleStr = fu.vehicles?.length > 0
              ? fu.vehicles.map((v: any) => `${v.year || ''} ${v.make || ''} ${v.model || ''}`).join(', ')
              : ''
            return (
              <div
                key={fu.id}
                className="bg-[var(--color-surface)] rounded-lg p-4 cursor-pointer active:bg-white/5 transition"
                onClick={() => navigate(`/jobs/${fu.job_id}`)}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${PRIORITY_COLORS[fu.priority] || ''}`}>
                      {PRIORITY_LABELS[fu.priority] || fu.priority}
                    </span>
                    <span className="text-white font-medium text-sm truncate">{customerName}</span>
                  </div>
                  <span className="text-xs text-[var(--color-muted)] shrink-0">
                    {timeAgo(fu.created_at)}
                  </span>
                </div>

                {vehicleStr && (
                  <p className="text-xs text-[var(--color-muted)] mb-1.5">{vehicleStr}</p>
                )}

                <p className="text-sm text-white/80 whitespace-pre-wrap">{fu.reason}</p>

                {fu.closed_note && (
                  <p className="text-xs text-green-400/70 mt-2 italic">Resolved: {fu.closed_note}</p>
                )}

                {viewMode === 'open' && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setResolveTarget(fu) }}
                    className="mt-3 text-xs text-green-400 hover:text-green-300 font-medium min-h-[44px] flex items-center"
                  >
                    ✓ Mark Resolved
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Resolve modal */}
      {resolveTarget && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => { setResolveTarget(null); setClosedNote('') }}>
          <div className="bg-[var(--color-surface)] rounded-lg p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-white font-medium mb-2">Resolve Follow-Up</h3>
            <p className="text-sm text-[var(--color-muted)] mb-3">
              Closing follow-up for <span className="text-white">{resolveTarget.jobs?.customers?.name || resolveTarget.jobs?.shop_name || '—'}</span>
            </p>
            <textarea
              value={closedNote}
              onChange={(e) => setClosedNote(e.target.value)}
              placeholder="Resolution note (optional)"
              rows={3}
              className="w-full bg-[var(--color-bg)] border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[var(--color-primary)] resize-none mb-4 min-h-[44px]"
            />
            <div className="flex gap-3 justify-end">
              <button onClick={() => { setResolveTarget(null); setClosedNote('') }}
                className="px-4 py-2.5 rounded-lg text-sm text-[var(--color-muted)] hover:text-white transition min-h-[44px]">Cancel</button>
              <button onClick={resolveFollowUp} disabled={resolving}
                className="bg-green-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-green-500 disabled:opacity-50 transition min-h-[44px]">
                {resolving ? 'Resolving...' : 'Resolve'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
