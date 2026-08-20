function fmt(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

export default function KpiCard({
  label,
  value,
  tone = "ink",
  hint,
}: {
  label: string;
  value: number;
  tone?: "revenue" | "cost" | "ink" | "accent";
  hint?: string;
}) {
  const color =
    tone === "revenue"
      ? "var(--revenue)"
      : tone === "cost"
      ? "var(--cost)"
      : tone === "accent"
      ? "var(--accent)"
      : "var(--ink)";

  return (
    <div className="card px-5 py-4">
      <div className="text-xs text-[var(--ink-muted)] mb-2">{label}</div>
      <div className="font-mono-num text-2xl font-medium" style={{ color }}>
        {value < 0 ? "-" : ""}${fmt(Math.abs(value))}
      </div>
      {hint && <div className="text-[11px] text-[var(--ink-muted)] mt-1">{hint}</div>}
    </div>
  );
}
