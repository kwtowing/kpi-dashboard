"use client";

import { useEffect, useState, useCallback } from "react";
import PeriodSelector from "@/components/PeriodSelector";
import KpiCard from "@/components/KpiCard";
import TrajectoryChart from "@/components/TrajectoryChart";
import CostBreakdown from "@/components/CostBreakdown";
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
    fetch("/api/flagged-calls")
      .then((r) => r.json())
      .then((j) => setFlaggedCount(j.count ?? 0))
      .catch(() => {});
  }, []);

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
            <span className="text-[var(--ink-muted)]"> — $0 total cost, review on the Drivers &amp; disputes page →</span>
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

          <TrajectoryChart series={data.series} period={data.period} projectedNext={data.projectedNext} />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <CostBreakdown breakdown={data.breakdown} />
            <RevenueVsCost series={data.series} period={data.period} />
          </div>
        </div>
      )}
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
  const shown = series.slice(-6);
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-1">
        <div className="font-display italic text-lg">Revenue vs. cost</div>
        <div className="flex items-center gap-3 text-[11px] text-[var(--ink-muted)]">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: "var(--revenue)" }} /> Revenue
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: "var(--cost)" }} /> Cost
          </span>
        </div>
      </div>
      <div className="text-xs text-[var(--ink-muted)] mb-4">
        Last {shown.length} {shown.length === 1 ? adverb[period] ?? period : `${adverb[period] ?? period} periods`}
      </div>
      {shown.length === 0 ? (
        <div className="text-sm text-[var(--ink-muted)] py-10 text-center">No data yet for this view.</div>
      ) : (
        <div className="space-y-3">
          {shown.reverse().map((s) => {
            const max = Math.max(s.revenue, s.cost, 1);
            return (
              <div key={s.bucket}>
                <div className="flex justify-between mb-1 text-xs text-[var(--ink-muted)]">
                  <span>{new Date(s.bucket).toLocaleDateString()}</span>
                  <span className="font-mono-num">
                    ${s.revenue.toLocaleString(undefined, { maximumFractionDigits: 0 })} / $
                    {s.cost.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </span>
                </div>
                <div className="flex gap-1 h-2 mb-1">
                  <div
                    className="rounded-full"
                    style={{ width: `${(s.revenue / max) * 100}%`, background: "var(--revenue)", minWidth: s.revenue > 0 ? "2px" : 0 }}
                  />
                </div>
                <div className="flex gap-1 h-2">
                  <div
                    className="rounded-full"
                    style={{ width: `${(s.cost / max) * 100}%`, background: "var(--cost)", minWidth: s.cost > 0 ? "2px" : 0 }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
