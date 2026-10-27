"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import PeriodSelector from "@/components/PeriodSelector";
import DateRangeFilter, { DateRange, computePreset } from "@/components/DateRangeFilter";
import DriverPerformanceExplorer from "@/components/DriverPerformanceExplorer";
import ExportButton from "@/components/ExportButton";

type DriverRow = {
  driver_id: string;
  driver_name?: string | null;
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
  driver_name?: string | null;
  trouble_cd: string | null;
  club_code: string | null;
  om_mileage: number | null;
  towed_kms_paid: number | null;
  towed_kms: number | null;
  subtotal: number | null;
  tax: number | null;
  total_cost: number | null;
};

type SummaryDriver = {
  driverId: string;
  name: string | null;
  calls: number;
  km: number;
  revenue: number;
  activeDays: number;
  zeroCalls: number;
  pay: number | null;
  prev: { calls: number; km: number; revenue: number; activeDays: number } | null;
};

type Thresholds = { lowPct: number; dropPct: number; zeroPct: number };
const DEFAULT_THRESHOLDS: Thresholds = { lowPct: 70, dropPct: 25, zeroPct: 10 };

type Verdict = {
  level: "ok" | "watch" | "attention" | "idle";
  reasons: string[];
  perDay: number | null;
  change: number | null;
};

const usd = (n: number) =>
  "$" + Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function assess(d: SummaryDriver, teamPerDay: number, t: Thresholds): Verdict {
  const reasons: string[] = [];
  const perDay = d.activeDays > 0 ? d.revenue / d.activeDays : null;
  const change =
    d.prev && d.prev.revenue > 0 ? ((d.revenue - d.prev.revenue) / d.prev.revenue) * 100 : null;
  if (d.calls === 0) {
    return {
      level: "idle",
      reasons: d.prev && d.prev.revenue > 0 ? ["No calls this period (earned " + usd(d.prev.revenue) + " last period)"] : [],
      perDay,
      change,
    };
  }
  let severe = false;
  if (perDay !== null && d.activeDays >= 2 && teamPerDay > 0 && perDay < (teamPerDay * t.lowPct) / 100) {
    reasons.push(`Earns ${usd(perDay)}/day vs team ${usd(teamPerDay)}/day`);
  }
  if (change !== null && change <= -t.dropPct) {
    reasons.push(`Revenue down ${Math.abs(change).toFixed(0)}% vs previous period`);
  }
  if (d.zeroCalls >= 2 && (d.zeroCalls / d.calls) * 100 >= t.zeroPct) {
    reasons.push(`${d.zeroCalls} of ${d.calls} calls paid $0`);
  }
  if (d.pay !== null && d.pay > 0 && d.revenue < d.pay) {
    reasons.push(`Revenue ${usd(d.revenue)} is below pay for the period (${usd(d.pay)})`);
    severe = true;
  }
  const level = reasons.length === 0 ? "ok" : severe || reasons.length >= 2 ? "attention" : "watch";
  return { level, reasons, perDay, change };
}

const LEVEL_STYLE: Record<Verdict["level"], { bg: string; fg: string; label: string }> = {
  ok: { bg: "var(--aqua-soft)", fg: "var(--revenue)", label: "On track" },
  watch: { bg: "#fff4d6", fg: "#9a6700", label: "Watch" },
  attention: { bg: "var(--cost-soft)", fg: "var(--cost)", label: "Needs attention" },
  idle: { bg: "var(--accent-soft)", fg: "var(--ink-muted)", label: "No calls" },
};

const PERIODS_3 = [
  { value: "day", label: "Daily" },
  { value: "week", label: "Weekly" },
  { value: "month", label: "Monthly" },
];

export default function DriversPage() {
  const [period, setPeriod] = useState("week");
  const [range, setRange] = useState<DateRange>(() => computePreset("last_4_weeks"));
  const [driverFilter, setDriverFilter] = useState("all");
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [thresholds, setThresholds] = useState<Thresholds>(DEFAULT_THRESHOLDS);
  const [showRules, setShowRules] = useState(false);
  const [summary, setSummary] = useState<SummaryDriver[]>([]);
  const [prevRange, setPrevRange] = useState<{ from: string; to: string } | null>(null);
  const [rows, setRows] = useState<DriverRow[]>([]);
  const [flagged, setFlagged] = useState<FlaggedCall[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (p: string, r: DateRange) => {
    setLoading(true);
    const suffix = r.from && r.to ? `&from=${r.from}&to=${r.to}` : "";
    const qs = r.from && r.to ? `?from=${r.from}&to=${r.to}` : "";
    const [driverRes, flagRes, sumRes] = await Promise.all([
      fetch(`/api/driver-report?period=${p}${suffix}`).then((res) => res.json()),
      fetch(`/api/flagged-calls?${r.from && r.to ? `from=${r.from}&to=${r.to}` : ""}`).then((res) => res.json()),
      fetch(`/api/driver-summary${qs}`).then((res) => res.json()),
    ]);
    setSummary(sumRes.drivers ?? []);
    setPrevRange(sumRes.previousRange ?? null);
    setRows(driverRes.rows ?? []);
    setFlagged(flagRes.calls ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load(period, range);
  }, [period, range, load]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("kw-driver-flag-rules");
      if (saved) setThresholds({ ...DEFAULT_THRESHOLDS, ...JSON.parse(saved) });
    } catch {}
  }, []);
  const saveThresholds = (t: Thresholds) => {
    setThresholds(t);
    try {
      localStorage.setItem("kw-driver-flag-rules", JSON.stringify(t));
    } catch {}
  };

  const nameOf = (d: { driverId: string; name: string | null }) => d.name || d.driverId;

  const { evaluated, teamPerDay, totals } = useMemo(() => {
    const days = summary.reduce((a, d) => a + d.activeDays, 0);
    const rev = summary.reduce((a, d) => a + d.revenue, 0);
    const teamPerDay = days > 0 ? rev / days : 0;
    const evaluated = summary.map((d) => ({ d, v: assess(d, teamPerDay, thresholds) }));
    const totals = {
      calls: summary.reduce((a, d) => a + d.calls, 0),
      km: summary.reduce((a, d) => a + d.km, 0),
      revenue: rev,
      prevRevenue: summary.reduce((a, d) => a + (d.prev?.revenue ?? 0), 0),
      zero: summary.reduce((a, d) => a + d.zeroCalls, 0),
    };
    return { evaluated, teamPerDay, totals };
  }, [summary, thresholds]);

  const shown = evaluated.filter(({ d, v }) => {
    if (driverFilter !== "all" && d.driverId !== driverFilter) return false;
    if (flaggedOnly && v.level !== "watch" && v.level !== "attention") return false;
    return true;
  });
  const flagCount = evaluated.filter(({ v }) => v.level === "attention").length;
  const watchCount = evaluated.filter(({ v }) => v.level === "watch").length;
  const shownRows = rows.filter((r) => driverFilter === "all" || r.driver_id === driverFilter);
  const rangeLabel = range.from && range.to ? `${range.from} → ${range.to}` : "All time";

  return (
    <div className="px-4 sm:px-8 py-6 sm:py-8 max-w-6xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
        <div>
          <h1 className="font-display italic text-3xl">Drivers &amp; disputes</h1>
          <p className="text-sm text-[var(--ink-muted)] mt-1">
            Revenue earned, KM paid and performance flags by driver — filter week on week or by any custom range.
          </p>
        </div>
      </div>

      <div className="card p-4 sm:p-5 mb-6 space-y-4">
        <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
          <div>
            <div className="text-xs text-[var(--ink-muted)] mb-1.5">Group by</div>
            <div className="inline-flex bg-[var(--bg)] border border-[var(--line)] rounded-full p-1">
              {PERIODS_3.map((p) => (
                <button
                  key={p.value}
                  onClick={() => setPeriod(p.value)}
                  className={`px-4 py-1.5 rounded-full text-sm transition-colors ${
                    period === p.value ? "bg-[var(--accent)] text-white" : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-xs text-[var(--ink-muted)] mb-1.5">Date range</div>
            <DateRangeFilter onChange={setRange} initialPreset="last_4_weeks" />
          </div>
          <div>
            <div className="text-xs text-[var(--ink-muted)] mb-1.5">Driver</div>
            <select
              value={driverFilter}
              onChange={(e) => setDriverFilter(e.target.value)}
              className="bg-[var(--surface)] border border-[var(--line)] rounded-full px-3 py-1.5 text-sm"
            >
              <option value="all">All drivers</option>
              {summary.map((d) => (
                <option key={d.driverId} value={d.driverId}>
                  {nameOf(d)}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm pb-1.5 cursor-pointer">
            <input type="checkbox" checked={flaggedOnly} onChange={(e) => setFlaggedOnly(e.target.checked)} />
            Flagged drivers only
          </label>
          <div className="ml-auto pb-0.5">
            <ExportButton
              filename="KW-Towing-Drivers-Disputes"
              sheets={[
                {
                  name: "Driver summary",
                  rows: shown.map(({ d, v }) => ({
                    Period: rangeLabel,
                    Driver: nameOf(d),
                    Calls: d.calls,
                    "KM paid": d.km,
                    "Revenue earned (CAD)": d.revenue,
                    "Active days": d.activeDays,
                    "Revenue per active day": v.perDay === null ? "" : Math.round(v.perDay * 100) / 100,
                    "Previous period revenue": d.prev?.revenue ?? 0,
                    "Change %": v.change === null ? "" : Math.round(v.change),
                    "Pay for period": d.pay ?? "",
                    "$0 calls": d.zeroCalls,
                    Status: LEVEL_STYLE[v.level].label,
                    "Why flagged": v.reasons.join("; "),
                  })),
                },
                {
                  name: "Driver breakdown",
                  rows: shownRows.map((r) => ({
                    Period: new Date(r.bucket).toLocaleDateString(),
                    Driver: r.driver_name || r.driver_id,
                    Calls: r.call_count,
                    "KM paid": r.km_paid,
                    "Revenue earned (CAD)": r.total_cost,
                    "Zero-paid calls": r.zero_value_count,
                  })),
                },
                {
                  name: "Flagged ($0) calls",
                  rows: flagged.map((c) => ({
                    Date: c.receive_date,
                    "Call #": c.call_no,
                    Garage: c.garage ?? "",
                    Driver: c.driver_name || c.driver_id || "",
                    Truck: c.truck ?? "",
                    "Trouble code": c.trouble_cd ?? "",
                    "KM towed": c.towed_kms ?? "",
                  })),
                },
              ]}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[var(--ink-muted)] border-t border-[var(--line)] pt-3">
          <span>
            Showing <b className="text-[var(--ink)]">{rangeLabel}</b>
            {prevRange && <> · compared with {prevRange.from} → {prevRange.to}</>}
          </span>
          <button className="underline ml-auto" onClick={() => setShowRules((v) => !v)}>
            {showRules ? "Hide flag rules" : "Flag rules"}
          </button>
        </div>

        {showRules && (
          <div className="grid sm:grid-cols-3 gap-4 text-sm bg-[var(--bg)] rounded-xl p-4">
            <label className="space-y-1">
              <div className="text-xs text-[var(--ink-muted)]">Flag if revenue per active day is below this % of team average</div>
              <input type="number" min={10} max={100} value={thresholds.lowPct}
                onChange={(e) => saveThresholds({ ...thresholds, lowPct: Number(e.target.value) || 0 })}
                className="w-24 border border-[var(--line)] rounded-lg px-2 py-1 bg-[var(--surface)]" /> %
            </label>
            <label className="space-y-1">
              <div className="text-xs text-[var(--ink-muted)]">Flag if revenue drops by at least this much vs previous period</div>
              <input type="number" min={5} max={100} value={thresholds.dropPct}
                onChange={(e) => saveThresholds({ ...thresholds, dropPct: Number(e.target.value) || 0 })}
                className="w-24 border border-[var(--line)] rounded-lg px-2 py-1 bg-[var(--surface)]" /> %
            </label>
            <label className="space-y-1">
              <div className="text-xs text-[var(--ink-muted)]">Flag if this share of the driver&apos;s calls paid $0 (min. 2 calls)</div>
              <input type="number" min={1} max={100} value={thresholds.zeroPct}
                onChange={(e) => saveThresholds({ ...thresholds, zeroPct: Number(e.target.value) || 0 })}
                className="w-24 border border-[var(--line)] rounded-lg px-2 py-1 bg-[var(--surface)]" /> %
            </label>
            <div className="sm:col-span-3 text-xs text-[var(--ink-muted)]">
              Also flagged when revenue is below the driver&apos;s pay for the period (needs pay entered in Administration).
              One reason = Watch; two or more, or revenue below pay = Needs attention. Drivers with fewer than 2 active days are not judged on revenue per day.
            </div>
          </div>
        )}
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
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { l: "Total revenue", v: usd(totals.revenue), sub: totals.prevRevenue > 0 ? `${totals.revenue >= totals.prevRevenue ? "▲" : "▼"} ${Math.abs(((totals.revenue - totals.prevRevenue) / totals.prevRevenue) * 100).toFixed(0)}% vs previous` : "" },
              { l: "Calls", v: totals.calls.toLocaleString(), sub: `${totals.km.toLocaleString()} KM paid` },
              { l: "Team revenue / driver-day", v: usd(teamPerDay), sub: "benchmark for flags" },
              { l: "Drivers flagged", v: `${flagCount + watchCount}`, sub: `${flagCount} need attention · ${watchCount} watch` },
            ].map((k) => (
              <div key={k.l} className="card px-4 py-3">
                <div className="text-xs text-[var(--ink-muted)]">{k.l}</div>
                <div className="font-mono-num text-xl mt-0.5">{k.v}</div>
                <div className="text-xs text-[var(--ink-muted)] mt-0.5">{k.sub || "\u00a0"}</div>
              </div>
            ))}
          </div>

          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-[var(--line)]">
              <div className="font-display italic text-lg">Driver performance &amp; revenue</div>
              <div className="text-xs text-[var(--ink-muted)]">
                Total revenue each driver earned in {rangeLabel}, compared with the previous period
              </div>
            </div>
            {shown.length === 0 ? (
              <div className="px-5 py-10 text-sm text-[var(--ink-muted)] text-center">
                No drivers match these filters.
              </div>
            ) : (
              <div className="overflow-x-auto"><table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[var(--ink-muted)] text-xs border-b border-[var(--line)]">
                    <th className="px-5 py-2 font-normal">Driver</th>
                    <th className="px-5 py-2 font-normal">Calls</th>
                    <th className="px-5 py-2 font-normal">KM paid</th>
                    <th className="px-5 py-2 font-normal">Revenue earned</th>
                    <th className="px-5 py-2 font-normal">Per active day</th>
                    <th className="px-5 py-2 font-normal">Previous period</th>
                    <th className="px-5 py-2 font-normal">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map(({ d, v }) => {
                    const st = LEVEL_STYLE[v.level];
                    return (
                      <tr key={d.driverId} className="border-t border-[var(--line)] align-top">
                        <td className="px-5 py-2.5">{nameOf(d)}</td>
                        <td className="px-5 py-2.5 font-mono-num">{d.calls}</td>
                        <td className="px-5 py-2.5 font-mono-num">{d.km.toLocaleString()}</td>
                        <td className="px-5 py-2.5 font-mono-num font-medium" style={{ color: "var(--revenue)" }}>
                          {usd(d.revenue)}
                          {d.pay !== null && (
                            <div className="text-[11px] font-normal text-[var(--ink-muted)]">pay {usd(d.pay)}</div>
                          )}
                        </td>
                        <td className="px-5 py-2.5 font-mono-num">
                          {v.perDay === null ? "—" : usd(v.perDay)}
                          <div className="text-[11px] text-[var(--ink-muted)]">{d.activeDays} day{d.activeDays === 1 ? "" : "s"}</div>
                        </td>
                        <td className="px-5 py-2.5 font-mono-num">
                          {d.prev ? usd(d.prev.revenue) : "—"}
                          {v.change !== null && (
                            <div className="text-[11px]" style={{ color: v.change >= 0 ? "var(--revenue)" : "var(--cost)" }}>
                              {v.change >= 0 ? "▲" : "▼"} {Math.abs(v.change).toFixed(0)}%
                            </div>
                          )}
                        </td>
                        <td className="px-5 py-2.5">
                          <span className="text-xs px-2 py-0.5 rounded-full whitespace-nowrap" style={{ background: st.bg, color: st.fg }}>
                            {v.level === "attention" || v.level === "watch" ? "⚑ " : ""}{st.label}
                          </span>
                          {v.reasons.map((r) => (
                            <div key={r} className="text-[11px] text-[var(--ink-muted)] mt-1 max-w-[260px]">{r}</div>
                          ))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {driverFilter === "all" && !flaggedOnly && (
                  <tfoot>
                    <tr className="border-t-2 border-[var(--line)] font-medium">
                      <td className="px-5 py-2.5">Total</td>
                      <td className="px-5 py-2.5 font-mono-num">{totals.calls}</td>
                      <td className="px-5 py-2.5 font-mono-num">{totals.km.toLocaleString()}</td>
                      <td className="px-5 py-2.5 font-mono-num" style={{ color: "var(--revenue)" }}>{usd(totals.revenue)}</td>
                      <td className="px-5 py-2.5 font-mono-num">{usd(teamPerDay)}</td>
                      <td className="px-5 py-2.5 font-mono-num">{usd(totals.prevRevenue)}</td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table></div>
            )}
          </div>

          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-[var(--line)]">
              <div className="font-display italic text-lg">Driver breakdown</div>
              <div className="text-xs text-[var(--ink-muted)]">
                {period === "day" ? "Per day" : period === "week" ? "Per week" : "Per month"}, most recent first · revenue earned by the driver in each period
              </div>
            </div>
            {shownRows.length === 0 ? (
              <div className="px-5 py-10 text-sm text-[var(--ink-muted)] text-center">
                No call data for these filters — import a CAA report to see this breakdown.
              </div>
            ) : (
              <div className="overflow-x-auto"><table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[var(--ink-muted)] text-xs border-b border-[var(--line)]">
                    <th className="px-5 py-2 font-normal">Period</th>
                    <th className="px-5 py-2 font-normal">Driver</th>
                    <th className="px-5 py-2 font-normal">Calls</th>
                    <th className="px-5 py-2 font-normal">KM paid</th>
                    <th className="px-5 py-2 font-normal">Revenue earned</th>
                    <th className="px-5 py-2 font-normal">Flagged</th>
                  </tr>
                </thead>
                <tbody>
                  {shownRows.map((r, i) => (
                    <tr key={i} className="border-t border-[var(--line)]">
                      <td className="px-5 py-2.5 font-mono-num text-xs text-[var(--ink-muted)]">
                        {new Date(r.bucket).toLocaleDateString()}
                      </td>
                      <td className="px-5 py-2.5">{r.driver_name || r.driver_id}</td>
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
              </table></div>
            )}
          </div>

          {flagged.length > 0 && (
            <div className="card overflow-hidden">
              <div className="px-5 py-4 border-b border-[var(--line)]">
                <div className="font-display italic text-lg">Flagged calls ($0 total cost)</div>
                <div className="text-xs text-[var(--ink-muted)]">Review these with CAA — likely disputes</div>
              </div>
              <div className="overflow-x-auto"><table className="w-full text-sm">
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
                      <td className="px-5 py-2.5">{c.driver_name || c.driver_id || "—"}</td>
                      <td className="px-5 py-2.5">{c.trouble_cd ?? "—"}</td>
                      <td className="px-5 py-2.5 font-mono-num">{c.towed_kms ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            </div>
          )}

          <DriverPerformanceExplorer />
        </div>
      )}
    </div>
  );
}
