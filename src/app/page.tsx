"use client";

import { useEffect, useState, useCallback } from "react";
import PeriodSelector from "@/components/PeriodSelector";
import KpiCard from "@/components/KpiCard";
import TrajectoryChart from "@/components/TrajectoryChart";
import CostBreakdown from "@/components/CostBreakdown";
import DriverWeeklyKm from "@/components/DriverWeeklyKm";
import SetupBanner from "@/components/SetupBanner";
import DateRangeFilter, { DateRange } from "@/components/DateRangeFilter";
import ExportButton from "@/components/ExportButton";
import Link from "next/link";

type KpiResponse = {
  period: string;
  range: { from: string; to: string } | null;
  series: { bucket: string; revenue: number; cost: number; profit: number }[];
  breakdown: { category: string; amount: number }[];
  totals: { revenue: number; cost: number; profit: number; count: number };
  comparison: { revenue: number | null; cost: number | null; profit: number | null } | null;
  projectedNext: number | null;
};

export default function DashboardPage() {
  const [period, setPeriod] = useState("month");
  const [range, setRange] = useState<DateRange>({ from: null, to: null });
  const [data, setData] = useState<KpiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [flaggedCount, setFlaggedCount] = useState(0);

  const load = useCallback(async (p: string, r: DateRange) => {
    setLoading(true);
    try {
      let url = `/api/kpis?period=${p}&points=12`;
      if (r.from && r.to) url += `&from=${r.from}&to=${r.to}`;
      const res = await fetch(url);
      if (res.status === 500) {
        const body = await res.json();
        if (String(body.error ?? "").includes("does not exist") || String(body.error ?? "").includes("DATABASE_URL")) {
          setNeedsSetup(true);
          setLoading(false);
          return;
        }
      }
      const json = await res.json();
      setData(json);
      setNeedsSetup(false);
    } catch {
      setNeedsSetup(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(period, range);
  }, [period, range, load]);

  useEffect(() => {
    // Follow the selected date range, so the banner agrees with the totals above it.
    const qs = range.from && range.to ? `?from=${range.from}&to=${range.to}` : "";
    fetch("/api/flagged-calls" + qs)
      .then((r) => r.json())
      .then((j) => setFlaggedCount(j.count ?? 0))
      .catch(() => {});
  }, [range]);

  if (needsSetup) {
    return <SetupBanner onReady={() => load(period, range)} />;
  }

  return (
    <div className="px-4 sm:px-8 py-6 sm:py-8 max-w-6xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
        <div>
          <h1 className="font-display italic text-3xl">Executive Dashboard</h1>
          <p className="text-sm text-[var(--ink-muted)] mt-1">
            KW Towing operations, revenue and cost — all figures in CAD.
          </p>
        </div>
        <PeriodSelector value={period} onChange={setPeriod} />
      </div>

      <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <DateRangeFilter onChange={setRange} />
        {data && (
          <ExportButton
            filename="KW-Towing-Executive-Dashboard"
            sheets={[
              {
                name: "Summary",
                rows: [
                  { Metric: "Total revenue (CAD)", Value: data.totals.revenue },
                  { Metric: "Total cost (CAD)", Value: data.totals.cost },
                  { Metric: "Net profit (CAD)", Value: data.totals.profit },
                  { Metric: "Projected next period (CAD)", Value: data.projectedNext ?? "" },
                  { Metric: "Period", Value: data.period },
                  { Metric: "Range", Value: range.from && range.to ? `${range.from} to ${range.to}` : "All time" },
                ],
              },
              {
                name: "Trajectory",
                rows: data.series.map((s) => ({
                  Date: new Date(s.bucket).toLocaleDateString(),
                  "Revenue (CAD)": s.revenue,
                  "Cost (CAD)": s.cost,
                  "Profit (CAD)": s.profit,
                })),
              },
              {
                name: "Cost breakdown",
                rows: data.breakdown.map((b) => ({ Category: b.category, "Amount (CAD)": b.amount })),
              },
            ]}
          />
        )}
      </div>

      {flaggedCount > 0 && (
        <Link
          href="/drivers"
          className="flex items-center gap-3 rounded-2xl border px-5 py-3.5 mb-6 hover:opacity-90 transition-opacity"
          style={{ background: "var(--cost-soft)", borderColor: "var(--cost)" }}
        >
          <span className="text-lg leading-none">⚠</span>
          <div className="text-sm" style={{ color: "var(--cost)" }}>
            <span className="font-medium">{flaggedCount} call{flaggedCount === 1 ? "" : "s"} flagged for dispute</span>
            <span className="text-[var(--ink-muted)]"> — $0 total cost{range.from && range.to ? " in this date range" : ""}, review on the Drivers &amp; disputes page →</span>
          </div>
        </Link>
      )}

      {loading || !data ? (
        <div className="text-sm text-[var(--ink-muted)]">Loading…</div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              label="Total revenue"
              value={data.totals.revenue}
              tone="revenue"
              deltaPct={data.comparison?.revenue ?? null}
              deltaGoodDirection="up"
            />
            <KpiCard
              label="Total cost"
              value={data.totals.cost}
              tone="cost"
              deltaPct={data.comparison?.cost ?? null}
              deltaGoodDirection="down"
            />
            <KpiCard
              label="Net profit"
              value={data.totals.profit}
              tone="accent"
              deltaPct={data.comparison?.profit ?? null}
              deltaGoodDirection="up"
            />
            <KpiCard
              label="Projected next period"
              value={data.projectedNext ?? 0}
              hint={data.projectedNext === null ? "Need more data" : undefined}
            />
          </div>

          <TrajectoryChart range={range} />

          <CostBreakdown period={period} range={range} />

          <DriverWeeklyKm />

          <RevenueVsCost series={data.series} period={data.period} />
        </div>
      )}
    </div>
  );
}

// --- Revenue vs. cost as dials -------------------------------------------
// Each period is a half-circle gauge. The needle shows revenue divided by cost:
// the top centre is break-even (1x), to the right revenue is covering cost with
// room to spare, to the left it is not. The scale runs 0x to 2x.

const GAUGE_MAX = 2;

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy - r * Math.sin(rad) };
}

// Arc between two angles (180 = far left, 90 = top, 0 = far right).
function arcPath(cx: number, cy: number, r: number, fromDeg: number, toDeg: number) {
  const a = polar(cx, cy, r, fromDeg);
  const b = polar(cx, cy, r, toDeg);
  const sweep = toDeg < fromDeg ? 1 : 0;
  return `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} A ${r} ${r} 0 0 ${sweep} ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
}

const money0 = (v: number) => `${v < 0 ? "-" : ""}$${Math.abs(Math.round(v)).toLocaleString()}`;

function Dial({
  label,
  revenue,
  cost,
  inProgress,
}: {
  label: string;
  revenue: number;
  cost: number;
  inProgress: boolean;
}) {
  const ratio = cost > 0 ? revenue / cost : revenue > 0 ? GAUGE_MAX : 0;
  const clamped = Math.min(Math.max(ratio, 0), GAUGE_MAX);
  const valueDeg = 180 - (clamped / GAUGE_MAX) * 180;
  const covers = ratio >= 1;
  const tone = covers ? "var(--revenue)" : "var(--cost)";
  const net = revenue - cost;

  const cx = 100;
  const cy = 100;
  const r = 78;
  const needle = polar(cx, cy, r - 10, valueDeg);

  const ratioText = ratio >= 10 ? "10×+" : `${ratio.toFixed(2)}×`;

  return (
    <div
      className="rounded-2xl border border-[var(--line)] px-3 pt-3 pb-4 text-center"
      title={`${label}: revenue ${money0(revenue)}, cost ${money0(cost)}`}
    >
      <div className="text-sm font-medium">
        {label}
        {inProgress && <span className="ml-1.5 text-[10px] font-normal text-[var(--ink-muted)]">so far</span>}
      </div>

      <svg viewBox="0 0 200 124" className="w-full max-w-[220px] mx-auto mt-1" role="img" aria-label={`${label} revenue to cost ${ratioText}`}>
        {/* Track: left half (not covering cost), right half (covering cost) */}
        <path d={arcPath(cx, cy, r, 180, 90)} fill="none" strokeWidth={12} strokeLinecap="butt" style={{ stroke: "var(--cost-soft)" }} />
        <path d={arcPath(cx, cy, r, 90, 0)} fill="none" strokeWidth={12} strokeLinecap="butt" style={{ stroke: "var(--revenue-soft)" }} />

        {/* Fill from break-even out to the needle */}
        {Math.abs(valueDeg - 90) > 0.5 && (
          <path d={arcPath(cx, cy, r, 90, valueDeg)} fill="none" strokeWidth={12} strokeLinecap="butt" style={{ stroke: tone }} />
        )}

        {/* Break-even tick */}
        <line x1={cx} y1={cy - r - 9} x2={cx} y2={cy - r + 9} strokeWidth={1.5} style={{ stroke: "var(--ink)" }} />

        {/* Scale labels */}
        <text x={cx - r} y={cy + 14} textAnchor="middle" fontSize="9" style={{ fill: "var(--ink-muted)" }}>0×</text>
        <text x={cx} y={cy - r - 13} textAnchor="middle" fontSize="9" style={{ fill: "var(--ink-muted)" }}>1×</text>
        <text x={cx + r} y={cy + 14} textAnchor="middle" fontSize="9" style={{ fill: "var(--ink-muted)" }}>2×</text>

        {/* Needle */}
        <line x1={cx} y1={cy} x2={needle.x} y2={needle.y} strokeWidth={2.5} strokeLinecap="round" style={{ stroke: "var(--ink)" }} />
        <circle cx={cx} cy={cy} r={5} style={{ fill: "var(--ink)" }} />

        {/* Reading */}
        <text x={cx} y={cy + 21} textAnchor="middle" fontSize="15" fontWeight="600" className="font-mono-num" style={{ fill: tone }}>
          {ratioText}
        </text>
      </svg>

      <div className="mt-1 flex justify-center gap-3 text-[11px] font-mono-num">
        <span style={{ color: "var(--revenue)" }}>{money0(revenue)}</span>
        <span className="text-[var(--ink-muted)]">/</span>
        <span style={{ color: "var(--cost)" }}>{money0(cost)}</span>
      </div>
      <div className="mt-0.5 text-[11px] font-mono-num" style={{ color: tone }}>
        {net >= 0 ? "+" : ""}
        {money0(net)} net
      </div>
    </div>
  );
}

function RevenueVsCost({
  series,
  period,
}: {
  series: { bucket: string; revenue: number; cost: number }[];
  period: string;
}) {
  const adverb: Record<string, string> = { day: "daily", week: "weekly", month: "monthly", year: "yearly" };
  const shown = series
    .slice(-6)
    .map((s) => ({ ...s, revenue: Number(s.revenue), cost: Number(s.cost) }))
    .reverse(); // newest first

  // Buckets are dates stored at midnight UTC; format them in UTC so a month
  // starting Oct 1 is not shown as Sep 30 in North American time zones.
  const bucketLabel = (bucket: string) => {
    const d = new Date(bucket);
    if (period === "month") return d.toLocaleDateString(undefined, { month: "short", year: "numeric", timeZone: "UTC" });
    if (period === "year") return String(d.getUTCFullYear());
    if (period === "week") return `Week of ${d.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" })}`;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  };

  // A period is still running if it has not ended yet.
  const isInProgress = (bucket: string) => {
    const d = new Date(bucket);
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth();
    const end =
      period === "year"
        ? Date.UTC(y + 1, 0, 1)
        : period === "month"
          ? Date.UTC(y, m + 1, 1)
          : d.getTime() + (period === "week" ? 7 : 1) * 24 * 60 * 60 * 1000;
    return end > Date.now();
  };

  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
        <div className="font-display italic text-lg">Revenue vs. cost</div>
        <div className="flex items-center gap-3 text-[11px] text-[var(--ink-muted)]">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: "var(--revenue)" }} /> Revenue covers cost
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: "var(--cost)" }} /> Cost is higher
          </span>
        </div>
      </div>
      <div className="text-xs text-[var(--ink-muted)] mb-4">
        Last {shown.length} {shown.length === 1 ? adverb[period] ?? period : `${adverb[period] ?? period} periods`} — the needle shows
        revenue ÷ cost; top centre is break-even
      </div>
      {shown.length === 0 ? (
        <div className="text-sm text-[var(--ink-muted)] py-10 text-center">No data yet for this view.</div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {shown.map((s) => (
            <Dial
              key={s.bucket}
              label={bucketLabel(s.bucket)}
              revenue={s.revenue}
              cost={s.cost}
              inProgress={isInProgress(s.bucket)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
