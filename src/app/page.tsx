"use client";

import { useEffect, useState, useCallback } from "react";
import PeriodSelector from "@/components/PeriodSelector";
import KpiCard from "@/components/KpiCard";
import TrajectoryChart from "@/components/TrajectoryChart";
import CostBreakdown from "@/components/CostBreakdown";
import SetupBanner from "@/components/SetupBanner";

type KpiResponse = {
  period: string;
  series: { bucket: string; revenue: number; cost: number; profit: number }[];
  breakdown: { category: string; amount: number }[];
  totals: { revenue: number; cost: number; profit: number; count: number };
  projectedNext: number | null;
};

export default function DashboardPage() {
  const [period, setPeriod] = useState("month");
  const [data, setData] = useState<KpiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);

  const load = useCallback(async (p: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/kpis?period=${p}&points=12`);
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
    load(period);
  }, [period, load]);

  if (needsSetup) {
    return <SetupBanner onReady={() => load(period)} />;
  }

  return (
    <div className="px-8 py-8 max-w-6xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display italic text-3xl">Overview</h1>
          <p className="text-sm text-[var(--ink-muted)] mt-1">
            Operational KPIs and cost reporting across every connected source.
          </p>
        </div>
        <PeriodSelector value={period} onChange={setPeriod} />
      </div>

      {loading || !data ? (
        <div className="text-sm text-[var(--ink-muted)]">Loading…</div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-4 gap-4">
            <KpiCard label="Total revenue" value={data.totals.revenue} tone="revenue" />
            <KpiCard label="Total cost" value={data.totals.cost} tone="cost" />
            <KpiCard label="Net profit" value={data.totals.profit} tone="accent" />
            <KpiCard
              label="Projected next period"
              value={data.projectedNext ?? 0}
              hint={data.projectedNext === null ? "Need more data" : undefined}
            />
          </div>

          <TrajectoryChart series={data.series} period={data.period} projectedNext={data.projectedNext} />

          <div className="grid grid-cols-2 gap-6">
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
  return (
    <div className="card p-5">
      <div className="font-display italic text-lg mb-1">Revenue vs. cost</div>
      <div className="text-xs text-[var(--ink-muted)] mb-4">Last {series.length} {period}ly periods</div>
      <div className="space-y-2">
        {series.slice(-6).reverse().map((s) => {
          const max = Math.max(s.revenue, s.cost, 1);
          return (
            <div key={s.bucket} className="text-xs">
              <div className="flex justify-between mb-1 text-[var(--ink-muted)]">
                <span>{new Date(s.bucket).toLocaleDateString()}</span>
              </div>
              <div className="flex gap-1 h-2 mb-2">
                <div
                  className="rounded-full"
                  style={{ width: `${(s.revenue / max) * 100}%`, background: "var(--revenue)" }}
                />
              </div>
              <div className="flex gap-1 h-2 mb-1">
                <div
                  className="rounded-full"
                  style={{ width: `${(s.cost / max) * 100}%`, background: "var(--cost)" }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
