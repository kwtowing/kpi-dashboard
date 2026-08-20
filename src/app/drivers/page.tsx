"use client";

import { useEffect, useState, useCallback } from "react";
import PeriodSelector from "@/components/PeriodSelector";

type DriverRow = {
  driver_id: string;
  bucket: string;
  call_count: number;
  km_paid: number;
  total_cost: number;
  zero_value_count: number;
};

type FlaggedCall = {
  id: number;
  call_no: string;
  receive_date: string;
  garage: string | null;
  truck: string | null;
  driver_id: string | null;
  trouble_cd: string | null;
  club_code: string | null;
  om_mileage: number | null;
  towed_kms_paid: number | null;
  towed_kms: number | null;
  subtotal: number | null;
  tax: number | null;
  total_cost: number | null;
};

const PERIODS_3 = [
  { value: "day", label: "Daily" },
  { value: "week", label: "Weekly" },
  { value: "month", label: "Monthly" },
];

export default function DriversPage() {
  const [period, setPeriod] = useState("day");
  const [rows, setRows] = useState<DriverRow[]>([]);
  const [flagged, setFlagged] = useState<FlaggedCall[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (p: string) => {
    setLoading(true);
    const [driverRes, flagRes] = await Promise.all([
      fetch(`/api/driver-report?period=${p}`).then((r) => r.json()),
      fetch(`/api/flagged-calls`).then((r) => r.json()),
    ]);
    setRows(driverRes.rows ?? []);
    setFlagged(flagRes.calls ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load(period);
  }, [period, load]);

  return (
    <div className="px-8 py-8 max-w-5xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display italic text-3xl">Drivers &amp; disputes</h1>
          <p className="text-sm text-[var(--ink-muted)] mt-1">
            KM paid and total cost by driver, recalculated automatically from every import.
          </p>
        </div>
        <div className="inline-flex bg-[var(--surface)] border border-[var(--line)] rounded-full p-1">
          {PERIODS_3.map((p) => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={`px-4 py-1.5 rounded-full text-sm transition-colors ${
                period === p.value ? "bg-[var(--ink)] text-white" : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {!loading && flagged.length > 0 && (
        <div
          className="rounded-2xl border px-5 py-4 mb-6 flex items-start gap-3"
          style={{ background: "var(--cost-soft)", borderColor: "var(--cost)" }}
        >
          <span className="text-lg leading-none">⚠</span>
          <div>
            <div className="text-sm font-medium" style={{ color: "var(--cost)" }}>
              {flagged.length} call{flagged.length === 1 ? "" : "s"} flagged for dispute
            </div>
            <div className="text-xs text-[var(--ink-muted)] mt-0.5">
              These calls have a $0 total cost — likely billing errors or disputes worth
              following up with CAA.
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-sm text-[var(--ink-muted)]">Loading…</div>
      ) : (
        <div className="space-y-6">
          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-[var(--line)]">
              <div className="font-display italic text-lg">Driver breakdown</div>
              <div className="text-xs text-[var(--ink-muted)]">
                {period === "day" ? "Per day" : period === "week" ? "Per week" : "Per month"}, most recent first
              </div>
            </div>
            {rows.length === 0 ? (
              <div className="px-5 py-10 text-sm text-[var(--ink-muted)] text-center">
                No call data yet — import a CAA report to see this breakdown.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[var(--ink-muted)] text-xs border-b border-[var(--line)]">
                    <th className="px-5 py-2 font-normal">Period</th>
                    <th className="px-5 py-2 font-normal">Driver</th>
                    <th className="px-5 py-2 font-normal">Calls</th>
                    <th className="px-5 py-2 font-normal">KM paid</th>
                    <th className="px-5 py-2 font-normal">Total cost</th>
                    <th className="px-5 py-2 font-normal">Flagged</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className="border-t border-[var(--line)]">
                      <td className="px-5 py-2.5 font-mono-num text-xs text-[var(--ink-muted)]">
                        {new Date(r.bucket).toLocaleDateString()}
                      </td>
                      <td className="px-5 py-2.5">{r.driver_id}</td>
                      <td className="px-5 py-2.5 font-mono-num">{r.call_count}</td>
                      <td className="px-5 py-2.5 font-mono-num">{Number(r.km_paid).toLocaleString()}</td>
                      <td className="px-5 py-2.5 font-mono-num" style={{ color: "var(--revenue)" }}>
                        ${Number(r.total_cost).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-5 py-2.5">
                        {Number(r.zero_value_count) > 0 ? (
                          <span
                            className="text-xs px-2 py-0.5 rounded-full"
                            style={{ background: "var(--cost-soft)", color: "var(--cost)" }}
                          >
                            {r.zero_value_count}
                          </span>
                        ) : (
                          <span className="text-xs text-[var(--ink-muted)]">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {flagged.length > 0 && (
            <div className="card overflow-hidden">
              <div className="px-5 py-4 border-b border-[var(--line)]">
                <div className="font-display italic text-lg">Flagged calls ($0 total cost)</div>
                <div className="text-xs text-[var(--ink-muted)]">Review these with CAA — likely disputes</div>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[var(--ink-muted)] text-xs border-b border-[var(--line)]">
                    <th className="px-5 py-2 font-normal">Date</th>
                    <th className="px-5 py-2 font-normal">Call #</th>
                    <th className="px-5 py-2 font-normal">Garage</th>
                    <th className="px-5 py-2 font-normal">Driver</th>
                    <th className="px-5 py-2 font-normal">Trouble code</th>
                    <th className="px-5 py-2 font-normal">KM towed</th>
                  </tr>
                </thead>
                <tbody>
                  {flagged.map((c) => (
                    <tr key={c.id} className="border-t border-[var(--line)]">
                      <td className="px-5 py-2.5 font-mono-num text-xs">{c.receive_date}</td>
                      <td className="px-5 py-2.5 font-mono-num">{c.call_no}</td>
                      <td className="px-5 py-2.5">{c.garage ?? "—"}</td>
                      <td className="px-5 py-2.5">{c.driver_id ?? "—"}</td>
                      <td className="px-5 py-2.5">{c.trouble_cd ?? "—"}</td>
                      <td className="px-5 py-2.5 font-mono-num">{c.towed_kms ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
