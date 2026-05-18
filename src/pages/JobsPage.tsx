import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Trash2, ArrowUpDown, Search } from 'lucide-react'
import { getJobs, getTeam, deleteJob, type Job } from '../lib/db'

const JOB_TYPE_LABELS: Record<string, string> = {
  diagnostic: 'Diagnostic', programming: 'Programming', adas: 'ADAS', keys: 'Keys', other: 'Other'
}
const STATUS_LABELS: Record<string, string> = {
  in_progress: 'In Progress', complete: 'Complete',
  paid: 'Paid', cancelled: 'Cancelled'
}
const STATUS_COLORS: Record<string, string> = {
  in_progress: 'bg-yellow-900/40 text-yellow-300',
  complete: 'bg-green-900/40 text-green-300',
  paid: 'bg-emerald-900/40 text-emerald-300', cancelled: 'bg-gray-700 text-gray-400'
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [techFilter, setTechFilter] = useState<string>('')
  const [dateFilter, setDateFilter] = useState<string>('')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [team, setTeam] = useState<any[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<any>(null)
  const [deleting, setDeleting] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    getTeam().then(setTeam).catch(console.error)
    loadJobs()
  }, [])

  async function loadJobs() {
    setLoading(true)
    try {
      const data = await getJobs({
        ...(statusFilter ? { status: statusFilter } : {}),
        ...(techFilter ? { assigned_to: techFilter } : {}),
      })
      setJobs(data)
    } catch (err) { console.error(err) }
    setLoading(false)
  }

  useEffect(() => { loadJobs() }, [statusFilter, techFilter])

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteJob(deleteTarget.id)
      setJobs(jobs.filter((j) => j.id !== deleteTarget.id))
    } catch (err) { console.error(err) }
    setDeleting(false)
    setDeleteTarget(null)
  }

  // Client-side date filter + search + sort
  let displayJobs = [...jobs] as any[]
  if (dateFilter) {
    displayJobs = displayJobs.filter((j: any) => {
      if (!j.scheduled_start) return false
      return j.scheduled_start.startsWith(dateFilter)
    })
  }
  if (searchQuery.trim()) {
    const q = searchQuery.trim().toLowerCase()
    displayJobs = displayJobs.filter((j: any) => {
      const customerName = (j.customers?.name || '').toLowerCase()
      const vehicleInfo = (j.job_vehicles || []).map((v: any) =>
        `${v.year || ''} ${v.make || ''} ${v.model || ''} ${v.vin || ''}`.toLowerCase()
      ).join(' ')
      const desc = (j.problem_description || '').toLowerCase()
      const codes = Array.isArray(j.diagnostic_codes) ? j.diagnostic_codes.join(' ').toLowerCase() : ''
      return customerName.includes(q) || vehicleInfo.includes(q) || desc.includes(q) || codes.includes(q)
    })
  }
  displayJobs.sort((a: any, b: any) => {
    const da = a.scheduled_start || ''
    const db = b.scheduled_start || ''
    return sortDir === 'asc' ? da.localeCompare(db) : db.localeCompare(da)
  })

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold">Jobs</h1>
        <button onClick={() => navigate('/jobs/new')}
          className="bg-[var(--color-primary)] text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 hover:brightness-110 transition">
          <Plus size={16} />New Job
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)] pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by customer, vehicle, VIN, description, codes…"
          className="w-full bg-[var(--color-surface)] border border-gray-700 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder:text-[var(--color-muted)] focus:outline-none focus:border-[var(--color-primary)]"
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-[var(--color-surface)] border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-[var(--color-primary)]">
          <option value="">All Statuses</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={techFilter} onChange={(e) => setTechFilter(e.target.value)}
          className="bg-[var(--color-surface)] border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-[var(--color-primary)]">
          <option value="">All Techs</option>
          {team.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)}
          className="bg-[var(--color-surface)] border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-[var(--color-primary)] [color-scheme:dark]" />
        {dateFilter && (
          <button onClick={() => setDateFilter('')} className="text-[var(--color-muted)] text-xs hover:text-white">Clear date</button>
        )}
      </div>

      {/* Job list */}
      {loading ? (
        <div className="bg-[var(--color-surface)] rounded-lg p-8 text-center text-[var(--color-muted)] text-sm">Loading...</div>
      ) : displayJobs.length === 0 ? (
        <div className="bg-[var(--color-surface)] rounded-lg p-8 text-center text-[var(--color-muted)] text-sm">No jobs found. Create your first job.</div>
      ) : (
        <>
          {/* Mobile card list (< md) */}
          <div className="md:hidden flex flex-col gap-3">
            {/* Sort toggle for mobile */}
            <button
              onClick={() => setSortDir(sortDir === 'asc' ? 'desc' : 'asc')}
              className="flex items-center gap-1.5 text-[var(--color-muted)] text-sm self-end px-1 min-h-[44px]"
            >
              Sort by Date <ArrowUpDown size={14} />
            </button>

            {displayJobs.map((job: any) => (
              <div
                key={job.id}
                onClick={() => navigate(`/jobs/${job.id}`)}
                className="bg-[var(--color-surface)] rounded-lg p-4 active:bg-white/5 transition cursor-pointer"
              >
                {/* Row 1: Customer name + price */}
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <span className="text-white font-medium text-base leading-tight truncate">
                    {job.customers?.name || '—'}
                  </span>
                  <span className="text-white font-medium text-base shrink-0">
                    {job.total > 0 ? `$${job.total.toFixed(2)}` : ''}
                  </span>
                </div>

                {/* Row 2: Vehicle */}
                <div className="text-[var(--color-muted)] text-sm mb-2.5 truncate">
                  {job.job_vehicles && job.job_vehicles.length > 0
                    ? job.job_vehicles.map((v: any, i: number) => (
                        <span key={i}>{i > 0 && ', '}{v.year} {v.make} {v.model}</span>
                      ))
                    : '—'}
                </div>

                {/* Row 3: Badges + meta */}
                <div className="flex items-center flex-wrap gap-2">
                  {/* Type badge */}
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full bg-white/5 ${job.job_type === 'diagnostic' ? 'text-orange-300' : job.job_type === 'programming' ? 'text-blue-300' : job.job_type === 'adas' ? 'text-purple-300' : job.job_type === 'keys' ? 'text-yellow-300' : 'text-gray-300'}`}>
                    {JOB_TYPE_LABELS[job.job_type] || job.job_type}
                  </span>

                  {/* Status badge */}
                  <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[job.status] || ''}`}>
                    {STATUS_LABELS[job.status] || job.status}
                  </span>

                  {/* Tech with color dot */}
                  <span className="flex items-center gap-1 text-xs text-[var(--color-muted)]">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: job.team?.color || '#6b7280' }}
                    />
                    {job.team?.name || 'Unassigned'}
                  </span>

                  {/* Spacer */}
                  <span className="flex-1" />

                  {/* Date */}
                  <span className="text-xs text-[var(--color-muted)]">
                    {job.scheduled_start
                      ? new Date(job.scheduled_start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                      : '—'}
                  </span>

                  {/* Delete button */}
                  <button
                    onClick={(e) => { e.stopPropagation(); setDeleteTarget(job) }}
                    className="text-gray-600 hover:text-red-400 active:text-red-400 transition p-2 -m-2 min-w-[44px] min-h-[44px] flex items-center justify-center"
                    title="Delete job"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop table (md+) */}
          <div className="hidden md:block bg-[var(--color-surface)] rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-left">
                  <th className="px-4 py-3 text-[var(--color-muted)] font-medium text-xs">Customer</th>
                  <th className="px-4 py-3 text-[var(--color-muted)] font-medium text-xs">Vehicle</th>
                  <th className="px-4 py-3 text-[var(--color-muted)] font-medium text-xs">Type</th>
                  <th className="px-4 py-3 text-[var(--color-muted)] font-medium text-xs">Tech</th>
                  <th className="px-4 py-3 text-[var(--color-muted)] font-medium text-xs">Status</th>
                  <th className="px-4 py-3 text-[var(--color-muted)] font-medium text-xs text-right">$</th>
                  <th className="px-4 py-3 text-[var(--color-muted)] font-medium text-xs cursor-pointer hover:text-white select-none"
                    onClick={() => setSortDir(sortDir === 'asc' ? 'desc' : 'asc')}>
                    <span className="flex items-center gap-1">Date <ArrowUpDown size={12} /></span>
                  </th>
                  <th className="px-4 py-3 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {displayJobs.map((job: any) => (
                  <tr key={job.id} onClick={() => navigate(`/jobs/${job.id}`)}
                    className="border-b border-gray-800/50 hover:bg-white/5 cursor-pointer transition">
                    <td className="px-4 py-3 text-white">{job.customers?.name || '—'}</td>
                    <td className="px-4 py-3 text-[var(--color-muted)]">
                      {job.job_vehicles && job.job_vehicles.length > 0
                        ? job.job_vehicles.map((v: any, i: number) => (
                            <span key={i}>{i > 0 && ', '}{v.year} {v.make} {v.model}</span>
                          ))
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium ${job.job_type === 'diagnostic' ? 'text-orange-300' : job.job_type === 'programming' ? 'text-blue-300' : job.job_type === 'adas' ? 'text-purple-300' : job.job_type === 'keys' ? 'text-yellow-300' : 'text-gray-300'}`}>
                        {JOB_TYPE_LABELS[job.job_type] || job.job_type}
                      </span>
                    </td>
                    <td className="px-4 py-3" style={{ color: job.team?.color || 'var(--color-muted)' }}>
                      {job.team?.name || 'Unassigned'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[job.status] || ''}`}>
                        {STATUS_LABELS[job.status] || job.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-white font-medium">
                      {job.total > 0 ? `$${job.total.toFixed(2)}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-muted)] text-xs">
                      {job.scheduled_start ? new Date(job.scheduled_start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={(e) => { e.stopPropagation(); setDeleteTarget(job) }}
                        className="text-gray-600 hover:text-red-400 transition p-1" title="Delete job">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setDeleteTarget(null)}>
          <div className="bg-[var(--color-surface)] rounded-lg p-6 max-w-sm w-full mx-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-white font-medium mb-2">Delete Job?</h3>
            <p className="text-sm text-[var(--color-muted)] mb-4">
              Are you sure you want to delete this job for <span className="text-white">{deleteTarget.customers?.name || 'Unknown'}</span>?
              This can't be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setDeleteTarget(null)}
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
