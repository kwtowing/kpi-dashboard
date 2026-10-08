"use client";

import { useEffect, useMemo, useState } from "react";
import Papa from "papaparse";
import { addMonths, addWeeks, addYears, format, parseISO } from "date-fns";
import ExportButton, { ExportSheet } from "@/components/ExportButton";
import { BreakdownTable, Scorecard, TrendCard } from "@/components/ReportParts";
import {
  CATEGORIES,
  CategoryDef,
  CategoryId,
  CompareMode,
  CompareResponse,
  PeriodType,
  computeChange,
  getCategory,
} from "@/lib/reportTypes";

type CategoryChoice = "overview" | CategoryId;

// What the "Overview" tab pulls together.
const OVERVIEW: CategoryId[] = ["financial", "caa", "safety"];

const PERIOD_TYPES: { value: PeriodType; label: string }[] = [
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "quarter", label: "Quarter" },
  { value: "year", label: "Year" },
  { value: "custom", label: "Custom" },
];

const field = "border border-[var(--line)] rounded-lg px-3 py-1.5 text-sm bg-[var(--surface)]";

function torontoToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto" }).format(new Date());
}

// Step the viewed period one week / month / quarter / year back or forward.
function shiftAnchor(type: PeriodType, anchor: string | null, dir: -1 | 1): string | null {
  const today = torontoToday();
  const base = parseISO(anchor ?? today);
  let next: Date;
  switch (type) {
    case "week":
      next = addWeeks(base, dir);
      break;
    case "month":
      next = addMonths(base, dir);
      break;
    case "quarter":
      next = addMonths(base, 3 * dir);
      break;
    default:
      next = addYears(base, dir);
  }
  const s = format(next, "yyyy-MM-dd");
  return s >= today ? null : s; // null = "now"
}

function capitalise(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function csvDownload(rows: Record<string, any>[], filename: string) {
  const blob = new Blob([Papa.unparse(rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ---- Export builders -------------------------------------------------------

function summaryRows(cat: CategoryDef, d: CompareResponse) {
  return cat.metrics.map((m) => {
    const c = computeChange(d.totals.a[m.key], d.totals.b[m.key], m);
    return {
      Metric: m.label,
      [d.periodA.label]: d.totals.a[m.key] ?? "",
      [d.periodB.label]: d.totals.b[m.key] ?? "",
      Change: c.delta ?? "",
      "Change %": c.isNew ? "new" : c.pct === null ? "" : Math.round(c.pct * 10) / 10,
    };
  });
}

function breakdownRows(cat: CategoryDef, d: CompareResponse) {
  const metrics = cat.metrics.filter((m) => !m.totalOnly);
  return d.rows.map((r) => {
    const out: Record<string, any> = { [cat.dimension]: r.label };
    for (const m of metrics) {
      const c = computeChange(r.a[m.key], r.b[m.key], m);
      out[`${m.label} — ${d.periodA.label}`] = r.a[m.key] ?? "";
      out[`${m.label} — ${d.periodB.label}`] = r.b[m.key] ?? "";
      out[`${m.label} — change`] = c.delta ?? "";
      out[`${m.label} — change %`] = c.isNew ? "new" : c.pct === null ? "" : Math.round(c.pct * 10) / 10;
    }
    return out;
  });
}

export default function ReportsPage() {
  const [category, setCategory] = useState<CategoryChoice>("overview");
  const [type, setType] = useState<PeriodType>("week");
  const [compare, setCompare] = useState<CompareMode>("previous");
  const [anchor, setAnchor] = useState<string | null>(null);
  const [likeForLike, setLikeForLike] = useState(true);
  const [by, setBy] = useState<string>("");

  // Custom ranges (used only when type === "custom").
  const [aFrom, setAFrom] = useState("");
  const [aTo, setATo] = useState("");
  const [bFrom, setBFrom] = useState("");
  const [bTo, setBTo] = useState("");

  const [results, setResults] = useState<Record<string, CompareResponse | { error: string }>>({});

  const shown: CategoryId[] = category === "overview" ? OVERVIEW : [category];
  const cat = category === "overview" ? null : getCategory(category)!;

  // Derived choices (so a stale selection can never leak into another category / period type).
  const effectiveBy = cat?.breakdowns?.some((b) => b.value === by) ? by : cat?.breakdowns?.[0]?.value ?? "";
  const effectiveCompare: CompareMode = type !== "custom" && compare === "custom" ? "previous" : compare;

  const customReady = type !== "custom" || Boolean(aFrom && aTo && (effectiveCompare !== "custom" || (bFrom && bTo)));

  // One query string per category — it doubles as the cache key for that result.
  const requests = useMemo(() => {
    const base = new URLSearchParams({ type, compare: effectiveCompare, likeForLike: likeForLike ? "1" : "0" });
    if (anchor && type !== "custom") base.set("anchor", anchor);
    if (type === "custom") {
      base.set("aFrom", aFrom);
      base.set("aTo", aTo);
      if (effectiveCompare === "custom") {
        base.set("bFrom", bFrom);
        base.set("bTo", bTo);
      }
    }
    return shown.map((id) => {
      const p = new URLSearchParams(base);
      p.set("category", id);
      if (category !== "overview" && effectiveBy) p.set("by", effectiveBy);
      return { id, qs: p.toString() };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, type, effectiveCompare, anchor, likeForLike, effectiveBy, aFrom, aTo, bFrom, bTo]);

  useEffect(() => {
    if (!customReady) return;
    let cancelled = false;
    for (const { qs } of requests) {
      fetch(`/api/reports/compare?${qs}`)
        .then((r) => r.json())
        .then((j) => {
          if (!cancelled) setResults((prev) => ({ ...prev, [qs]: j }));
        })
        .catch(() => {
          if (!cancelled) setResults((prev) => ({ ...prev, [qs]: { error: "Couldn't load this report." } }));
        });
    }
    return () => {
      cancelled = true;
    };
  }, [requests, customReady]);

  const resultFor = (id: CategoryId) => {
    const qs = requests.find((r) => r.id === id)?.qs;
    return qs ? results[qs] : undefined;
  };
  const loading = customReady && requests.some((r) => !results[r.qs]);

  // The first loaded response tells us how the periods were resolved.
  const firstOk = shown.map((id) => resultFor(id)).find((r): r is CompareResponse => !!r && !("error" in r));
  const atPresent = anchor === null;

  // ---- Exports ----
  const exportSheets: ExportSheet[] = useMemo(() => {
    const sheets: ExportSheet[] = [];
    for (const id of shown) {
      const r = resultFor(id);
      const c = getCategory(id);
      if (!r || "error" in r || !c || r.connected === false) continue;
      const short = c.label.replace(/[^A-Za-z ]/g, "").slice(0, 18);
      sheets.push({ name: `${short} summary`, rows: summaryRows(c, r) });
      if (category !== "overview") sheets.push({ name: `${short} breakdown`, rows: breakdownRows(c, r) });
    }
    return sheets;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results, requests, category]);

  const fileBase = `KW-Towing-Report-${category}-${format(new Date(), "yyyy-MM-dd")}`;

  const csvRows = (): Record<string, any>[] => {
    if (category !== "overview" && cat) {
      const r = resultFor(cat.id);
      if (r && !("error" in r)) return r.rows.length > 0 ? breakdownRows(cat, r) : summaryRows(cat, r);
      return [];
    }
    return shown.flatMap((id) => {
      const r = resultFor(id);
      const c = getCategory(id)!;
      return r && !("error" in r) && r.connected !== false ? summaryRows(c, r).map((row) => ({ Category: c.label, ...row })) : [];
    });
  };

  const canExport = exportSheets.length > 0;

  return (
    <div className="px-4 sm:px-8 py-6 sm:py-8 max-w-6xl">
      <h1 className="font-display italic text-3xl mb-1">Reports</h1>
      <p className="text-sm text-[var(--ink-muted)] mb-6 max-w-3xl">
        Compare any period with the one before it — week on week, month on month, quarter on quarter, year on year — or
        pick your own dates. Everything here is read from the same data as the rest of the portal.
      </p>

      {/* Category tabs */}
      <div className="no-print flex flex-wrap gap-1.5 mb-5">
        {[{ id: "overview", label: "Overview" }, ...CATEGORIES].map((c) => (
          <button
            key={c.id}
            onClick={() => setCategory(c.id as CategoryChoice)}
            className={`px-4 py-1.5 rounded-full text-sm border transition-colors ${
              category === c.id
                ? "bg-[var(--ink)] text-white border-[var(--ink)]"
                : "bg-[var(--surface)] text-[var(--ink-muted)] border-[var(--line)] hover:text-[var(--ink)]"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* Period controls */}
      <div className="no-print card px-4 py-3 mb-5 flex flex-wrap items-center gap-x-5 gap-y-3">
        <div className="inline-flex bg-[var(--bg)] border border-[var(--line)] rounded-full p-1">
          {PERIOD_TYPES.map((p) => (
            <button
              key={p.value}
              onClick={() => {
                setType(p.value);
                setAnchor(null);
              }}
              className={`px-3.5 py-1 rounded-full text-sm transition-colors ${
                type === p.value ? "bg-[var(--ink)] text-white" : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {type !== "custom" && (
          <div className="inline-flex items-center gap-1">
            <button
              onClick={() => setAnchor((a) => shiftAnchor(type, a, -1))}
              aria-label={`Previous ${type}`}
              className="w-8 h-8 rounded-lg border border-[var(--line)] bg-[var(--surface)] hover:bg-[var(--bg)]"
            >
              ‹
            </button>
            <div className="px-3 text-sm min-w-[11rem] text-center">
              {firstOk ? (
                <>
                  <div className="font-medium leading-tight">{firstOk.periodA.label}</div>
                  <div className="text-[11px] text-[var(--ink-muted)]">{firstOk.periodA.range}</div>
                </>
              ) : (
                <span className="text-[var(--ink-muted)]">{atPresent ? "Current" : anchor}</span>
              )}
            </div>
            <button
              onClick={() => setAnchor((a) => shiftAnchor(type, a, 1))}
              disabled={atPresent}
              aria-label={`Next ${type}`}
              className="w-8 h-8 rounded-lg border border-[var(--line)] bg-[var(--surface)] hover:bg-[var(--bg)] disabled:opacity-30 disabled:cursor-not-allowed"
            >
              ›
            </button>
            {!atPresent && (
              <button onClick={() => setAnchor(null)} className="ml-1 text-xs text-[var(--accent)] hover:underline">
                Back to now
              </button>
            )}
          </div>
        )}

        <label className="flex items-center gap-2 text-sm text-[var(--ink-muted)]">
          Compare with
          <select value={effectiveCompare} onChange={(e) => setCompare(e.target.value as CompareMode)} className={field}>
            <option value="previous">{type === "custom" ? "Period just before" : `Previous ${type}`}</option>
            <option value="yoy">Same dates last year</option>
            {type === "custom" && <option value="custom">Another date range</option>}
          </select>
        </label>

        {cat?.breakdowns && (
          <label className="flex items-center gap-2 text-sm text-[var(--ink-muted)]">
            Break down
            <select value={effectiveBy} onChange={(e) => setBy(e.target.value)} className={field}>
              {cat.breakdowns.map((b) => (
                <option key={b.value} value={b.value}>
                  {b.label}
                </option>
              ))}
            </select>
          </label>
        )}

        {type !== "custom" && (
          <label className="flex items-center gap-2 text-sm text-[var(--ink-muted)] cursor-pointer">
            <input type="checkbox" checked={likeForLike} onChange={(e) => setLikeForLike(e.target.checked)} />
            Match days elapsed
          </label>
        )}

        {type === "custom" && (
          <div className="basis-full flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-[var(--ink-muted)]">
            <div className="flex items-center gap-2">
              Period
              <input type="date" value={aFrom} onChange={(e) => setAFrom(e.target.value)} className={field} />
              to
              <input type="date" value={aTo} onChange={(e) => setATo(e.target.value)} className={field} />
            </div>
            {effectiveCompare === "custom" && (
              <div className="flex items-center gap-2">
                Compared with
                <input type="date" value={bFrom} onChange={(e) => setBFrom(e.target.value)} className={field} />
                to
                <input type="date" value={bTo} onChange={(e) => setBTo(e.target.value)} className={field} />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Comparison banner + actions */}
      {firstOk && (
        <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
          <div className="text-sm">
            <span className="font-medium">{firstOk.periodA.label}</span>{" "}
            <span className="text-[var(--ink-muted)]">({firstOk.periodA.range})</span>
            <span className="text-[var(--ink-muted)]"> compared with </span>
            <span className="font-medium">{firstOk.periodB.label}</span>{" "}
            <span className="text-[var(--ink-muted)]">({firstOk.periodB.range})</span>
            {firstOk.note && <div className="text-xs text-[var(--ink-muted)] mt-1 max-w-2xl">{firstOk.note}</div>}
          </div>
          <div className="no-print flex items-center gap-2 flex-wrap">
            {canExport && <ExportButton sheets={exportSheets} filename={fileBase} />}
            <button
              disabled={!canExport}
              onClick={() => csvDownload(csvRows(), fileBase)}
              className="px-4 py-1.5 rounded-full border border-[var(--line)] text-sm bg-[var(--surface)] hover:bg-[var(--bg)] transition-colors disabled:opacity-40"
            >
              Export CSV
            </button>
            <button
              disabled={!canExport}
              onClick={() => window.print()}
              className="px-4 py-1.5 rounded-full border border-[var(--line)] text-sm bg-[var(--surface)] hover:bg-[var(--bg)] transition-colors disabled:opacity-40"
            >
              Print / Save as PDF
            </button>
          </div>
        </div>
      )}

      {!customReady && (
        <div className="card px-5 py-10 text-sm text-[var(--ink-muted)] text-center">
          Choose the dates above to build your custom comparison.
        </div>
      )}

      {customReady && loading && !firstOk && (
        <div className="text-sm text-[var(--ink-muted)] py-10 text-center">Loading report…</div>
      )}

      {/* Reports */}
      {customReady &&
        shown.map((id) => {
          const c = getCategory(id)!;
          const r = resultFor(id);
          if (!r) return null;

          const header = (
            <div className="mb-3">
              <div className="font-display italic text-xl">{c.label}</div>
              <div className="text-xs text-[var(--ink-muted)]">{c.blurb}</div>
            </div>
          );

          if ("error" in r) {
            return (
              <section key={id} className="mb-10">
                {header}
                <div className="card px-5 py-4 text-sm text-[var(--cost)]">
                  Couldn&apos;t load this report: {r.error}. If the database hasn&apos;t been set up yet, open Administration first.
                </div>
              </section>
            );
          }
          if (r.connected === false) {
            return (
              <section key={id} className="mb-10">
                {header}
                <div className="card px-5 py-4 text-sm text-[var(--ink-muted)]">{r.reason}</div>
              </section>
            );
          }

          const granularity = type === "custom" ? "month" : type;
          return (
            <section key={id} className="mb-10 space-y-4">
              {header}
              <Scorecard cat={c} data={r} />
              {r.notes.map((n) => (
                <div key={n} className="text-xs text-[var(--ink-muted)]">
                  {n}
                </div>
              ))}
              {category !== "overview" && c.hasTrend && <TrendCard key={`${c.id}-${granularity}`} cat={c} granularity={granularity} />}
              {category !== "overview" && (
                <BreakdownTable
                  key={c.id}
                  cat={c}
                  data={r}
                  dimensionLabel={capitalise(c.breakdowns?.find((b) => b.value === effectiveBy)?.label.replace(/^By /, "") ?? c.dimension)}
                />
              )}
            </section>
          );
        })}

      {category === "overview" && firstOk && (
        <p className="text-xs text-[var(--ink-muted)]">
          Open a category above for the trend over time and a full breakdown by driver, truck, code or garage.
        </p>
      )}
    </div>
  );
}
