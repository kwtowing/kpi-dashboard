export default function ComingSoon({
  title,
  description,
  phase,
}: {
  title: string;
  description: string;
  phase: string;
}) {
  return (
    <div className="px-8 py-8 max-w-2xl">
      <h1 className="font-display italic text-3xl mb-1">{title}</h1>
      <p className="text-sm text-[var(--ink-muted)] mb-8">{description}</p>
      <div className="card px-5 py-4" style={{ borderColor: "var(--accent)" }}>
        <div className="text-sm font-medium mb-1">Planned for {phase}</div>
        <p className="text-xs text-[var(--ink-muted)] leading-relaxed">
          This stack is part of the roadmap but not built yet. Tell Claude to start on it
          whenever you&apos;re ready — the database foundation (driver &amp; truck master,
          assignments) is already in place to support it.
        </p>
      </div>
    </div>
  );
}
