import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { getJobs, getTeam, type Job } from '../lib/db'

const JOB_TYPE_LABELS: Record<string, string> = {
  diagnostic: 'Diagnostic', programming: 'Programming', adas: 'ADAS', keys: 'Keys', other: 'Other'
}
const STATUS_LABELS: Record<string, string> = {
  scheduled: 'Scheduled', in_progress: 'In Progress', complete: 'Complete',
  invoiced: 'Invoiced', paid: 'Paid', cancelled: 'Cancelled'
}
const STATUS_COLORS: Record<string, string> = {
  scheduled: 'bg-blue-900/40 text-blue-300', in_progress: 'bg-yellow-900/40 text-yellow-300',
  complete: 'bg-green-900/40 text-green-300', invoiced: 'bg-purple-900/40 text-purple-300',
  paid: 'bg-emerald-900/40 text-emerald-300', cancelled: 'bg-gray-700 text-gray-400'
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [techFilter, setTechFilter] = useState<string>('')
  const [team, setTeam] = useState<any[]>([])
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

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold">Jobs</h1>
        <button onClick={() => navigate('/jobs/new')}
          className="bg-[var(--color-primary)] text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 hover:brightness-110 transition">
          <Plus size={16} />New Job
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4">
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
      </div>

      {/* Job list */}
      <div className="bg-[var(--color-surface)] rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-[var(--color-muted)] text-sm">Loading...</div>
        ) : jobs.length === 0 ? (
          <div className="p-8 text-center text-[var(--color-muted)] text-sm">No jobs found. Create your first job.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-left">
                <th className="px-4 py-3 text-[var(--color-muted)] font-medium text-xs">Customer</th>
                <th className="px-4 py-3 text-[var(--color-muted)] font-medium text-xs">Vehicle</th>
                <th className="px-4 py-3 text-[var(--color-muted)] font-medium text-xs">Type</th>
                <th className="px-4 py-3 text-[var(--color-muted)] font-medium text-xs">Tech</th>
                <th className="px-4 py-3 text-[var(--color-muted)] font-medium text-xs">Status</th>
                <th className="px-4 py-3 text-[var(--color-muted)] font-medium text-xs">When</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job: any) => (
                <tr key={job.id} onClick={() => navigate(`/jobs/${job.id}`)}
                  className="border-b border-gray-800/50 hover:bg-white/5 cursor-pointer transition">
                  <td className="px-4 py-3 text-white">{job.customers?.name || '—'}</td>
                  <td className="px-4 py-3 text-[var(--color-muted)]">
                    {job.vehicles ? `${job.vehicles.year} ${job.vehicles.make} ${job.vehicles.model}` : '—'}
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
                  <td className="px-4 py-3 text-[var(--color-muted)] text-xs">
                    {job.scheduled_start ? new Date(job.scheduled_start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
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
