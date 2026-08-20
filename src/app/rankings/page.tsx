"use client";

import { useEffect, useState } from "react";

type Row = {
  calls: number;
  revenue: number;
  km_paid: number;
  revenue_per_km: number | null;
  zero_paid_calls: number;
};
type DriverRow = Row & { driver_id: string };
type TruckRow = Row & { truck: string };

type SortKey = "revenue" | "calls" | "revenue_per_km" | "zero_paid_calls";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "revenue", label: "Highest revenue" },
  { key: "calls", label: "Most calls" },
  { key: "revenue_per_km", label: "Best revenue/km" },
  { key: "zero_paid_calls", label: "Most zero-paid calls" },
];

function fmt(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export default function RankingsPage() {
  const [tab, setTab] = useState<"drivers" | "trucks">("drivers");
  const [sort, setSort] = useState<SortKey>("revenue");
  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  const [trucks, setTrucks] = useState<TruckRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/rankings")
      .then((r) => r.json())
      .then((j) => {
        setDrivers(j.drivers ?? []);
        setTrucks(j.trucks ?? []);
        setLoading(false);
      });
  }, []);

  const sorted = (tab === "drivers" ? [...drivers] : [...trucks]).sort((a, b) => {
    const av = a[sort] ?? -Infinity;
    const bv = b[sort] ?? -Infinity;
    return Number(bv) - Number(av);
  });

  return (
    <div className="px-8 py-8 max-w-4xl">
      <h1 className="font-display italic text-3xl mb-1">Rankings</h1>
      <p className="text-sm text-[var(--ink-muted)] mb-8">
        Driver and truck leaderboards from every CAA call recorded so far.
      </p>

      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="inline-flex bg-[var(--surface)] border border-[var(--line)] rounded-full p-1">
          {(["drivers", "trucks"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-full text-sm capitalize transition-colors ${
                tab === t ? "bg-[var(--ink)] text-white" : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="border border-[var(--line)] rounded-lg px-3 py-1.5 text-sm bg-[var(--surface)]"
        >
          {SORTS.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="text-sm text-[var(--ink-muted)]">Loading…</div>
      ) : sorted.length === 0 ? (
        <div className="card px-5 py-10 text-sm text-[var(--ink-muted)] text-center">
          No call data yet — import a CAA report to populate rankings.
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[var(--ink-muted)] text-xs border-b border-[var(--line)]">
                <th className="px-5 py-2 font-normal">#</th>
                <th className="px-5 py-2 font-normal">{tab === "drivers" ? "Driver" : "Truck"}</th>
                <th className="px-5 py-2 font-normal">Calls</th>
                <th className="px-5 py-2 font-normal">Revenue (CAD)</th>
                <th className="px-5 py-2 font-normal">Revenue/km</th>
                <th className="px-5 py-2 font-normal">Zero-paid</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, i) => (
                <tr key={"driver_id" in r ? r.driver_id : r.truck} className="border-t border-[var(--line)]">
                  <td className="px-5 py-2.5 font-mono-num text-xs text-[var(--ink-muted)]">{i + 1}</td>
                  <td className="px-5 py-2.5 font-medium">{"driver_id" in r ? r.driver_id : r.truck}</td>
                  <td className="px-5 py-2.5 font-mono-num">{r.calls}</td>
                  <td className="px-5 py-2.5 font-mono-num" style={{ color: "var(--revenue)" }}>
                    ${fmt(r.revenue)}
                  </td>
                  <td className="px-5 py-2.5 font-mono-num">{r.revenue_per_km !== null ? `$${fmt(r.revenue_per_km)}` : "—"}</td>
                  <td className="px-5 py-2.5">
                    {r.zero_paid_calls > 0 ? (
                      <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--cost-soft)", color: "var(--cost)" }}>
                        {r.zero_paid_calls}
                      </span>
                    ) : (
                      <span className="text-xs text-[var(--ink-muted)]">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
