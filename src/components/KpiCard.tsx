function fmt(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

export default function KpiCard({
  label,
  value,
  tone = "ink",
  hint,
  deltaPct,
  deltaGoodDirection = "up",
}: {
  label: string;
  value: number;
  tone?: "revenue" | "cost" | "ink" | "accent";
  hint?: string;
  deltaPct?: number | null;
  // Whether an increase is good news (revenue, profit) or bad news (cost).
  deltaGoodDirection?: "up" | "down";
}) {
  const color =
    tone === "revenue"
      ? "var(--revenue)"
      : tone === "cost"
      ? "var(--cost)"
      : tone === "accent"
      ? "var(--accent)"
      : "var(--ink)";

  const showDelta = deltaPct !== undefined && deltaPct !== null && Number.isFinite(deltaPct);
  const isUp = showDelta && (deltaPct as number) > 0;
  const isFlat = showDelta && Math.abs(deltaPct as number) < 0.5;
  const isGood = showDelta && !isFlat && (deltaGoodDirection === "up" ? isUp : !isUp);

  return (
    <div className="card px-5 py-4">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs text-[var(--ink-muted)]">{label}</div>
        {showDelta && !isFlat && (
          <div
            className="text-[11px] font-mono-num px-1.5 py-0.5 rounded-full flex items-center gap-0.5"
            style={{
              background: isGood ? "var(--revenue-soft)" : "var(--cost-soft)",
              color: isGood ? "var(--revenue)" : "var(--cost)",
            }}
          >
            {isUp ? "↑" : "↓"} {Math.abs(deltaPct as number).toFixed(0)}%
          </div>
        )}
      </div>
      <div className="font-mono-num text-2xl font-medium" style={{ color }}>
        {value < 0 ? "-" : ""}${fmt(Math.abs(value))}
      </div>
      {hint && <div className="text-[11px] text-[var(--ink-muted)] mt-1">{hint}</div>}
      {showDelta && isFlat && <div className="text-[11px] text-[var(--ink-muted)] mt-1">No change vs last period</div>}
    </div>
  );
}
