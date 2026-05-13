export default function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="p-6">
      <h1 className="text-xl font-bold mb-6">{title}</h1>
      <div className="bg-[var(--color-surface)] rounded-lg p-12 text-center">
        <p className="text-[var(--color-muted)]">{title} module — coming in Phase 2</p>
      </div>
    </div>
  )
}
