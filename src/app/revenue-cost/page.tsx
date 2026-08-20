"use client";

import { useEffect, useState } from "react";

type DriverRow = {
  driver_id: string;
  driver_name: string | null;
  calls: number;
  revenue: number;
  hours: number;
  hourly_rate: number | null;
  labour_cost: number | null;
  contribution: number | null;
  calls_missing_times: number;
};

type TruckRow = { truck: string; calls: number; revenue: number; km_paid: number };

function fmt(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export default function RevenueCostPage() {
  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  const [trucks, setTrucks] = useState<TruckRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/revenue-cost")
      .then((r) => r.json())
      .then((j) => {
        setDrivers(j.drivers ?? []);
        setTrucks(j.trucks ?? []);
        setLoading(false);
      });
  }, []);

  const totalRevenue = drivers.reduce((s, d) => s + d.revenue, 0);
  const totalLabour = drivers.reduce((s, d) => s + (d.labour_cost ?? 0), 0);
  const ratesConfigured = drivers.some((d) => d.hourly_rate !== null);

  return (
    <div className="px-8 py-8 max-w-5xl">
      <h1 className="font-display italic text-3xl mb-1">Revenue vs Operational Cost</h1>
      <p className="text-sm text-[var(--ink-muted)] mt-1 mb-8">
        Revenue minus estimated driver labour cost, by driver and truck. All figures in CAD.
      </p>

      {!loading && !ratesConfigured && (
        <div className="card px-5 py-4 mb-6" style={{ borderColor: "var(--accent)" }}>
          <div className="text-sm font-medium mb-1">No hourly rates configured</div>
          <p className="text-xs text-[var(--ink-muted)] leading-relaxed">
            Labour cost and contribution stay blank until each driver has an hourly rate. Set
            these in <a href="/administration" className="underline">Administration → Driver master</a>.
            Revenue and call counts already work without it.
          </p>
        </div>
      )}

      {loading ? (
        <div className="text-sm text-[var(--ink-muted)]">Loading…</div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-3 gap-4">
            <div className="card px-5 py-4">
              <div className="text-xs text-[var(--ink-muted)] mb-2">Total revenue</div>
              <div className="font-mono-num text-2xl font-medium" style={{ color: "var(--revenue)" }}>
                ${fmt(totalRevenue)}
              </div>
            </div>
            <div className="card px-5 py-4">
              <div className="text-xs text-[var(--ink-muted)] mb-2">Est. driver labour cost</div>
              <div className="font-mono-num text-2xl font-medium" style={{ color: "var(--cost)" }}>
                ${fmt(totalLabour)}
              </div>
            </div>
            <div className="card px-5 py-4">
              <div className="text-xs text-[var(--ink-muted)] mb-2">Est. contribution</div>
              <div className="font-mono-num text-2xl font-medium" style={{ color: "var(--accent)" }}>
                ${fmt(totalRevenue - totalLabour)}
              </div>
            </div>
          </div>

          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-[var(--line)]">
              <div className="font-display italic text-lg">Driver profitability</div>
              <div className="text-xs text-[var(--ink-muted)]">
                Labour cost estimated from call duration (response to clear time) × hourly rate
              </div>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[var(--ink-muted)] text-xs border-b border-[var(--line)]">
                  <th className="px-5 py-2 font-normal">Driver</th>
                  <th className="px-5 py-2 font-normal">Calls</th>
                  <th className="px-5 py-2 font-normal">Revenue</th>
                  <th className="px-5 py-2 font-normal">Hours</th>
                  <th className="px-5 py-2 font-normal">Labour cost</th>
                  <th className="px-5 py-2 font-normal">Contribution</th>
                </tr>
              </thead>
              <tbody>
                {drivers.map((d) => (
                  <tr key={d.driver_id} className="border-t border-[var(--line)]">
                    <td className="px-5 py-2.5">{d.driver_name || d.driver_id}</td>
                    <td className="px-5 py-2.5 font-mono-num">{d.calls}</td>
                    <td className="px-5 py-2.5 font-mono-num" style={{ color: "var(--revenue)" }}>
                      ${fmt(d.revenue)}
                    </td>
                    <td className="px-5 py-2.5 font-mono-num text-xs text-[var(--ink-muted)]">
                      {d.hours}
                      {d.calls_missing_times > 0 && ` (${d.calls_missing_times} missing times)`}
                    </td>
                    <td className="px-5 py-2.5 font-mono-num">
                      {d.labour_cost !== null ? `$${fmt(d.labour_cost)}` : <span className="text-[var(--ink-muted)]">no rate set</span>}
                    </td>
                    <td className="px-5 py-2.5 font-mono-num" style={{ color: d.contribution !== null && d.contribution < 0 ? "var(--cost)" : "var(--accent)" }}>
                      {d.contribution !== null ? `$${fmt(d.contribution)}` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-[var(--line)]">
              <div className="font-display italic text-lg">Truck revenue</div>
              <div className="text-xs text-[var(--ink-muted)]">
                Fuel, maintenance and fixed costs aren&apos;t tracked per truck yet — this is
                revenue only, for now
              </div>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[var(--ink-muted)] text-xs border-b border-[var(--line)]">
                  <th className="px-5 py-2 font-normal">Truck</th>
                  <th className="px-5 py-2 font-normal">Calls</th>
                  <th className="px-5 py-2 font-normal">KM paid</th>
                  <th className="px-5 py-2 font-normal">Revenue</th>
                  <th className="px-5 py-2 font-normal">Revenue/km</th>
                </tr>
              </thead>
              <tbody>
                {trucks.map((t) => (
                  <tr key={t.truck} className="border-t border-[var(--line)]">
                    <td className="px-5 py-2.5 font-medium">{t.truck}</td>
                    <td className="px-5 py-2.5 font-mono-num">{t.calls}</td>
                    <td className="px-5 py-2.5 font-mono-num">{fmt(t.km_paid)}</td>
                    <td className="px-5 py-2.5 font-mono-num" style={{ color: "var(--revenue)" }}>
                      ${fmt(t.revenue)}
                    </td>
                    <td className="px-5 py-2.5 font-mono-num">
                      {t.km_paid > 0 ? `$${fmt(t.revenue / t.km_paid)}` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
