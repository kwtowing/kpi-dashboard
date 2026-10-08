"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  CategoryDef,
  Change,
  CompareResponse,
  MetricDef,
  TrendResponse,
  computeChange,
  formatDelta,
  formatPct,
  formatValue,
} from "@/lib/reportTypes";

// ---------------------------------------------------------------------------
// Change chip
// ---------------------------------------------------------------------------

export function ChangeChip({ change, metric, compact = false }: { change: Change; metric: MetricDef; compact?: boolean }) {
  if (change.direction === null) {
    return <span className="text-[11px] text-[var(--ink-muted)]">—</span>;
  }
  const style =
    change.tone === "good"
      ? { background: "var(--revenue-soft)", color: "var(--revenue)" }
      : change.tone === "bad"
      ? { background: "var(--cost-soft)", color: "var(--cost)" }
      : { background: "var(--bg)", color: "var(--ink-muted)" };
  const arrow = change.direction === "up" ? "↑" : change.direction === "down" ? "↓" : "→";
  return (
    <span
      className="inline-flex items-center gap-1 text-[11px] font-mono-num px-1.5 py-0.5 rounded-full whitespace-nowrap"
      style={style}
      title={`${formatDelta(change.delta, metric.unit)} (${formatPct(change)})`}
    >
      {arrow} {change.direction === "flat" ? "no change" : formatPct(change)}
      {!compact && change.direction !== "flat" && change.delta !== null && (
        <span className="opacity-70">· {formatDelta(change.delta, metric.unit)}</span>
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Scorecard — one tile per metric, this period vs the comparison period
// ---------------------------------------------------------------------------

export function Scorecard({ cat, data }: { cat: CategoryDef; data: CompareResponse }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
      {cat.metrics.map((m) => {
        const a = data.totals.a[m.key];
        const b = data.totals.b[m.key];
        const change = computeChange(a, b, m);
        return (
          <div key={m.key} className="card px-5 py-4">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="text-xs text-[var(--ink-muted)]">{m.label}</div>
              <ChangeChip change={change} metric={m} compact />
            </div>
            <div className="font-mono-num text-2xl font-medium">{formatValue(a, m.unit)}</div>
            <div className="text-[11px] text-[var(--ink-muted)] mt-1 flex items-center justify-between gap-2">
              <span>
                vs <span className="font-mono-num">{formatValue(b, m.unit)}</span>
              </span>
              {change.delta !== null && change.direction !== "flat" && (
                <span className="font-mono-num">{formatDelta(change.delta, m.unit)}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Trend — the last several weeks / months / quarters / years in a row
// ---------------------------------------------------------------------------

function axisFormat(v: number, unit: MetricDef["unit"]) {
  if (unit === "currency") return `$${Math.abs(v) >= 1000 ? `${(v / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })}k` : v}`;
  if (unit === "percent") return `${v}%`;
  return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

const GRAN_WORD: Record<string, string> = { week: "weeks", month: "months", quarter: "quarters", year: "years" };

export function TrendCard({ cat, granularity }: { cat: CategoryDef; granularity: string }) {
  const [metricKey, setMetricKey] = useState(cat.metrics[0].key);
  const [trend, setTrend] = useState<TrendResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    fetch(`/api/reports/trend?category=${cat.id}&granularity=${granularity}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((j) => {
        if (j.error) setError(j.error);
        else setTrend(j);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError("Couldn't load the trend.");
      });
    return () => ctrl.abort();
  }, [cat.id, granularity]);

  const metric = cat.metrics.find((m) => m.key === metricKey) ?? cat.metrics[0];
  const data = useMemo(
    () =>
      (trend?.buckets ?? []).map((b) => ({
        label: b.label,
        value: b.values[metric.key] ?? null,
        partial: b.partial,
        start: b.start,
        end: b.end,
      })),
    [trend, metric.key]
  );

  return (
    <div className="card p-5">
      <div className="flex items-baseline justify-between mb-4 flex-wrap gap-2">
        <div>
          <div className="font-display italic text-lg">Trend</div>
          <div className="text-xs text-[var(--ink-muted)]">
            {metric.label}, last {data.length || ""} {GRAN_WORD[granularity] ?? "periods"}
            {data.some((d) => d.partial) ? " · latest bar is still in progress" : ""}
          </div>
        </div>
        <select
          value={metric.key}
          onChange={(e) => setMetricKey(e.target.value)}
          className="no-print border border-[var(--line)] rounded-lg px-3 py-1.5 text-sm bg-[var(--surface)]"
          aria-label="Trend metric"
        >
          {cat.metrics.map((m) => (
            <option key={m.key} value={m.key}>
              {m.label}
            </option>
          ))}
        </select>
      </div>
      {error ? (
        <div className="text-sm text-[var(--cost)]">{error}</div>
      ) : !trend ? (
        <div className="text-sm text-[var(--ink-muted)] py-16 text-center">Loading trend…</div>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="var(--line)" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--ink-muted)" }} axisLine={{ stroke: "var(--line)" }} tickLine={false} />
            <YAxis
              tick={{ fontSize: 11, fill: "var(--ink-muted)" }}
              axisLine={false}
              tickLine={false}
              width={52}
              tickFormatter={(v) => axisFormat(Number(v), metric.unit)}
            />
            <Tooltip
              cursor={{ fill: "var(--bg)" }}
              formatter={(value: any) => [formatValue(value === null ? null : Number(value), metric.unit), metric.label]}
              labelFormatter={(_l: any, payload: any) => {
                const p = payload?.[0]?.payload;
                return p ? `${p.start} → ${p.end}${p.partial ? " (in progress)" : ""}` : "";
              }}
              contentStyle={{ borderRadius: 10, border: "1px solid var(--line)", fontSize: 12 }}
            />
            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
              {data.map((d, i) => (
                <Cell key={i} fill="var(--accent)" fillOpacity={d.partial ? 0.4 : 1} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Breakdown — each driver / truck / code, this period vs the comparison period
// ---------------------------------------------------------------------------

type SortMode = "current" | "increase" | "decrease" | "name";

export function BreakdownTable({ cat, data, dimensionLabel }: { cat: CategoryDef; data: CompareResponse; dimensionLabel: string }) {
  const metrics = cat.metrics.filter((m) => !m.totalOnly);
  const [metricKey, setMetricKey] = useState(metrics[Math.min(1, metrics.length - 1)].key);
  const [sort, setSort] = useState<SortMode>("current");
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);

  const metric = metrics.find((m) => m.key === metricKey) ?? metrics[0];

  const rows = (() => {
    const needle = search.trim().toLowerCase();
    const list = data.rows
      .filter((r) => !needle || r.label.toLowerCase().includes(needle))
      .map((r) => ({ r, a: r.a[metric.key], b: r.b[metric.key], change: computeChange(r.a[metric.key], r.b[metric.key], metric) }));
    const val = (x: number | null | undefined) => (x === null || x === undefined ? -Infinity : x);
    list.sort((x, y) => {
      if (sort === "name") return x.r.label.localeCompare(y.r.label);
      if (sort === "increase") return (y.change.delta ?? -Infinity) - (x.change.delta ?? -Infinity);
      if (sort === "decrease") return (x.change.delta ?? Infinity) - (y.change.delta ?? Infinity);
      return val(y.a) - val(x.a);
    });
    return list;
  })();

  const LIMIT = 25;
  const visible = showAll ? rows : rows.slice(0, LIMIT);

  return (
    <div className="card overflow-hidden">
      <div className="px-5 pt-5 pb-3 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="font-display italic text-lg">Breakdown by {dimensionLabel.toLowerCase()}</div>
          <div className="text-xs text-[var(--ink-muted)]">
            {data.rows.length} {data.rows.length === 1 ? "row" : "rows"} · {metric.label}
          </div>
        </div>
        <div className="no-print flex items-center gap-2 flex-wrap">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Find ${dimensionLabel.toLowerCase()}…`}
            className="border border-[var(--line)] rounded-lg px-3 py-1.5 text-sm bg-[var(--surface)] w-40"
          />
          <select
            value={metric.key}
            onChange={(e) => setMetricKey(e.target.value)}
            className="border border-[var(--line)] rounded-lg px-3 py-1.5 text-sm bg-[var(--surface)]"
            aria-label="Metric"
          >
            {metrics.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </select>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortMode)}
            className="border border-[var(--line)] rounded-lg px-3 py-1.5 text-sm bg-[var(--surface)]"
            aria-label="Sort"
          >
            <option value="current">Highest this period</option>
            <option value="increase">Biggest increase</option>
            <option value="decrease">Biggest decrease</option>
            <option value="name">Name A–Z</option>
          </select>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="px-5 py-10 text-sm text-[var(--ink-muted)] text-center">
          {data.rows.length === 0 ? "No activity in either period." : "Nothing matches that search."}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[var(--ink-muted)] text-xs border-y border-[var(--line)]">
                <th className="px-5 py-2 font-normal">{dimensionLabel}</th>
                <th className="px-5 py-2 font-normal text-right">This period</th>
                <th className="px-5 py-2 font-normal text-right">Compared with</th>
                <th className="px-5 py-2 font-normal text-right">Change</th>
                <th className="px-5 py-2 font-normal text-right">%</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(({ r, a, b, change }) => (
                <tr key={r.key} className="border-b border-[var(--line)] last:border-0">
                  <td className="px-5 py-2.5">{r.label}</td>
                  <td className="px-5 py-2.5 text-right font-mono-num">{formatValue(a, metric.unit)}</td>
                  <td className="px-5 py-2.5 text-right font-mono-num text-[var(--ink-muted)]">{formatValue(b, metric.unit)}</td>
                  <td className="px-5 py-2.5 text-right font-mono-num">{formatDelta(change.delta, metric.unit)}</td>
                  <td className="px-5 py-2.5 text-right">
                    <ChangeChip change={change} metric={metric} compact />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows.length > LIMIT && (
        <div className="no-print px-5 py-3 border-t border-[var(--line)] text-center">
          <button onClick={() => setShowAll((s) => !s)} className="text-sm text-[var(--accent)] hover:underline">
            {showAll ? `Show top ${LIMIT}` : `Show all ${rows.length}`}
          </button>
        </div>
      )}
    </div>
  );
}
