export default function AdminLoading() {
  return (
    <div aria-busy="true" aria-label="Chargement" className="space-y-6">
      <div className="skeleton h-8 w-64 rounded-xl" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="skeleton h-32 rounded-[var(--radius-card)]" />
        ))}
      </div>
      <div className="skeleton h-80 rounded-[var(--radius-card)]" />
    </div>
  );
}
