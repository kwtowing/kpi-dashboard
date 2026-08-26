"use client";

import { useEffect, useState, useCallback } from "react";
import ExportButton from "@/components/ExportButton";

type Selection = {
  year: string | null;
  month: string | null;
  week: string | null;
  day: string | null;
  driver: string | null;
  truck: string | null;
};

const EMPTY: Selection = { year: null, month: null, week: null, day: null, driver: null, truck: null };

type Row = { label: string; calls: number; revenue: number; km_paid: number; zero_paid: number };
type CallRow = {
  id: number;
  call_no: string;
  receive_date: string;
  garage: string | null;
  trouble_cd: string | null;
  call_status: string | null;
  towed_kms_paid: number | null;
  towed_kms: number | null;
  total_cost: number | null;
};

function fmt(n: number) {
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function labelFor(level: string, raw: string) {
  if (level === "year") return raw.slice(0, 4);
  if (level === "month") return MONTH_NAMES[new Date(raw).getUTCMonth()];
  if (level === "week") return `Week of ${new Date(raw).toLocaleDateString()}`;
  if (level === "day") return new Date(raw).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  return raw;
}

export default function PerformanceExplorerPage() {
  const [selection, setSelection] = useState<Selection>(EMPTY);
  const [payment, setPayment] = useState("all");
  const [troubleCd, setTroubleCd] = useState("");
  const [level, setLevel] = useState("year");
  const [rows, setRows] = useState<Row[]>([]);
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (sel: Selection, pay: string, code: string) => {
    setLoading(true);
    const params = new URLSearchParams();
    if (sel.year) params.set("year", sel.year);
    if (sel.month) params.set("month", sel.month);
    if (sel.week) params.set("week", sel.week);
    if (sel.day) params.set("day", sel.day);
    if (sel.driver) params.set("driver", sel.driver);
    if (sel.truck) params.set("truck", sel.truck);
    if (pay !== "all") params.set("payment", pay);
    if (code) params.set("trouble_cd", code);

    const res = await fetch(`/api/performance-explorer?${params.toString()}`);
    const json = await res.json();
    setLevel(json.level);
    if (json.level === "call") {
      setCalls(json.rows ?? []);
      setRows([]);
    } else {
      setRows(json.rows ?? []);
      setCalls([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load(selection, payment, troubleCd);
  }, [selection, payment, troubleCd, load]);

  function drillInto(rawLabel: string) {
    if (level === "year") setSelection((s) => ({ ...s, year: rawLabel.slice(0, 4) }));
    else if (level === "month") setSelection((s) => ({ ...s, month: String(new Date(rawLabel).getUTCMonth() + 1) }));
    else if (level === "week") setSelection((s) => ({ ...s, week: rawLabel.slice(0, 10) }));
    else if (level === "day") setSelection((s) => ({ ...s, day: rawLabel.slice(0, 10) }));
    else if (level === "driver") setSelection((s) => ({ ...s, driver: rawLabel }));
    else if (level === "truck") setSelection((s) => ({ ...s, truck: rawLabel }));
  }

  function jumpTo(depth: number) {
    const keys: (keyof Selection)[] = ["year", "month", "week", "day", "driver", "truck"];
    const next = { ...EMPTY };
    for (let i = 0; i < depth; i++) next[keys[i]] = selection[keys[i]];
    setSelection(next);
  }

  const crumbs: { label: string; depth: number }[] = [{ label: "All years", depth: 0 }];
  if (selection.year) crumbs.push({ label: selection.year, depth: 1 });
  if (selection.month) crumbs.push({ label: MONTH_NAMES[Number(selection.month) - 1], depth: 2 });
  if (selection.week) crumbs.push({ label: `Week of ${new Date(selection.week).toLocaleDateString()}`, depth: 3 });
  if (selection.day) crumbs.push({ label: new Date(selection.day).toLocaleDateString(), depth: 4 });
  if (selection.driver) crumbs.push({ label: selection.driver, depth: 5 });
  if (selection.truck) crumbs.push({ label: selection.truck, depth: 6 });

  const levelLabel: Record<string, string> = {
    year: "Year",
    month: "Month",
    week: "Week",
    day: "Day",
    driver: "Driver",
    truck: "Truck",
    call: "Call",
  };

  return (
    <div className="px-4 sm:px-8 py-6 sm:py-8 max-w-5xl">
      <h1 className="font-display italic text-3xl mb-1">Performance Explorer</h1>
      <p className="text-sm text-[var(--ink-muted)] mt-1 mb-6">
        Drill down from year to an individual call. Click any row to go deeper.
      </p>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex flex-wrap items-center gap-1 text-sm">
          {crumbs.map((c, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <span className="text-[var(--ink-muted)]">/</span>}
              <button
                onClick={() => jumpTo(c.depth)}
                className={`px-2 py-1 rounded-lg ${
                  i === crumbs.length - 1 ? "text-[var(--ink)] font-medium" : "text-[var(--accent)] hover:underline"
                }`}
              >
                {c.label}
              </button>
            </span>
          ))}
        </div>
        <ExportButton
          filename="KW-Towing-Performance-Explorer"
          sheets={[
            level === "call"
              ? {
                  name: "Calls",
                  rows: calls.map((c) => ({
                    Date: c.receive_date,
                    "Call #": c.call_no,
                    Garage: c.garage ?? "",
                    "Trouble code": c.trouble_cd ?? "",
                    "KM paid": c.towed_kms_paid ?? "",
                    "Total cost (CAD)": c.total_cost ?? "",
                  })),
                }
              : {
                  name: levelLabel[level] ?? "Breakdown",
                  rows: rows.map((r) => ({
                    [levelLabel[level]]: labelFor(level, r.label),
                    Calls: r.calls,
                    "Revenue (CAD)": r.revenue,
                    "KM paid": r.km_paid,
                    "Zero-paid": r.zero_paid,
                  })),
                },
          ]}
        />
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        <select
          value={payment}
          onChange={(e) => setPayment(e.target.value)}
          className="border border-[var(--line)] rounded-lg px-3 py-1.5 text-sm bg-[var(--surface)]"
        >
          <option value="all">All payments</option>
          <option value="paid">Paid only</option>
          <option value="zero">Zero-paid only</option>
        </select>
        <input
          value={troubleCd}
          onChange={(e) => setTroubleCd(e.target.value)}
          placeholder="Filter by service code…"
          className="border border-[var(--line)] rounded-lg px-3 py-1.5 text-sm bg-[var(--surface)]"
        />
      </div>

      {loading ? (
        <div className="text-sm text-[var(--ink-muted)]">Loading…</div>
      ) : level === "call" ? (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[var(--ink-muted)] text-xs border-b border-[var(--line)]">
                <th className="px-5 py-2 font-normal">Date</th>
                <th className="px-5 py-2 font-normal">Call #</th>
                <th className="px-5 py-2 font-normal">Garage</th>
                <th className="px-5 py-2 font-normal">Code</th>
                <th className="px-5 py-2 font-normal">KM paid</th>
                <th className="px-5 py-2 font-normal">Total cost</th>
              </tr>
            </thead>
            <tbody>
              {calls.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-sm text-[var(--ink-muted)]">
                    No calls match these filters.
                  </td>
                </tr>
              ) : (
                calls.map((c) => (
                  <tr key={c.id} className="border-t border-[var(--line)]">
                    <td className="px-5 py-2.5 font-mono-num text-xs">{c.receive_date}</td>
                    <td className="px-5 py-2.5 font-mono-num">{c.call_no}</td>
                    <td className="px-5 py-2.5">{c.garage ?? "—"}</td>
                    <td className="px-5 py-2.5 font-mono-num text-xs">{c.trouble_cd ?? "—"}</td>
                    <td className="px-5 py-2.5 font-mono-num">{c.towed_kms_paid ?? "—"}</td>
                    <td
                      className="px-5 py-2.5 font-mono-num"
                      style={{ color: c.total_cost === 0 ? "var(--cost)" : "var(--revenue)" }}
                    >
                      {c.total_cost !== null ? `$${fmt(c.total_cost)}` : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table></div>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[var(--ink-muted)] text-xs border-b border-[var(--line)]">
                <th className="px-5 py-2 font-normal">{levelLabel[level]}</th>
                <th className="px-5 py-2 font-normal">Calls</th>
                <th className="px-5 py-2 font-normal">Revenue</th>
                <th className="px-5 py-2 font-normal">KM paid</th>
                <th className="px-5 py-2 font-normal">Zero-paid</th>
                <th className="px-5 py-2 font-normal"></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-sm text-[var(--ink-muted)]">
                    No data at this level.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr
                    key={r.label}
                    onClick={() => drillInto(r.label)}
                    className="border-t border-[var(--line)] cursor-pointer hover:bg-[var(--bg)]"
                  >
                    <td className="px-5 py-2.5 font-medium">{labelFor(level, r.label)}</td>
                    <td className="px-5 py-2.5 font-mono-num">{r.calls}</td>
                    <td className="px-5 py-2.5 font-mono-num" style={{ color: "var(--revenue)" }}>
                      ${fmt(r.revenue)}
                    </td>
                    <td className="px-5 py-2.5 font-mono-num">{fmt(r.km_paid)}</td>
                    <td className="px-5 py-2.5">
                      {r.zero_paid > 0 ? (
                        <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--cost-soft)", color: "var(--cost)" }}>
                          {r.zero_paid}
                        </span>
                      ) : (
                        <span className="text-xs text-[var(--ink-muted)]">—</span>
                      )}
                    </td>
                    <td className="px-5 py-2.5 text-[var(--ink-muted)]">›</td>
                  </tr>
                ))
              )}
            </tbody>
          </table></div>
        </div>
      )}
    </div>
  );
}
