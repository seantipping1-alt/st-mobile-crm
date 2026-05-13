export default function DashboardPage() {
  return (
    <div className="p-6">
      <h1 className="text-xl font-bold mb-6">Schedule</h1>

      <div className="bg-[var(--color-surface)] rounded-lg p-6 mb-6">
        <h2 className="text-sm font-medium text-[var(--color-muted)] mb-4">Today's Jobs</h2>
        <p className="text-[var(--color-muted)] text-sm">
          Google Calendar sync coming in Phase 1. Your diagnostic research brief is already running daily at 7pm.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Jobs Today', value: '—' },
          { label: 'In Progress', value: '—' },
          { label: 'Unpaid Invoices', value: '—' },
        ].map((stat) => (
          <div key={stat.label} className="bg-[var(--color-surface)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{stat.label}</p>
            <p className="text-2xl font-bold">{stat.value}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
