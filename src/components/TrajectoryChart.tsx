"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from "recharts";

type WeekRow = { bucket: string; profit: number };

type ChartPoint = {
  label: string;
  profit: number | null;
  trend: number | null;
  projected: number | null;
  partial?: boolean;
};

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const WEEKS_SHOWN = 26;

const fmtMoney = (v: number) => `${v < 0 ? "-" : ""}$${Math.abs(Math.round(v)).toLocaleString()}`;

// Weeks are Monday-based buckets stored as dates; format in UTC so the label
// never slips to the previous day in the viewer's time zone.
function weekLabel(ms: number) {
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}

function toUtcMs(bucket: string) {
  const d = new Date(bucket);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

// Least-squares line through (index, value) pairs.
function linearFit(values: number[]) {
  const n = values.length;
  if (n < 2) return null;
  const meanX = (n - 1) / 2;
  const meanY = values.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  values.forEach((y, x) => {
    num += (x - meanX) * (y - meanY);
    den += (x - meanX) ** 2;
  });
  const slope = den === 0 ? 0 : num / den;
  return { slope, intercept: meanY - slope * meanX };
}

export default function TrajectoryChart({ range }: { range: { from: string | null; to: string | null } }) {
  const [rows, setRows] = useState<WeekRow[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    setError(false);
    let url = `/api/kpis?period=week&points=${WEEKS_SHOWN}`;
    if (range.from && range.to) url += `&from=${range.from}&to=${range.to}`;
    fetch(url)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        if (!Array.isArray(j.series)) throw new Error("bad response");
        setRows(j.series.map((s: any) => ({ bucket: s.bucket, profit: Number(s.profit) })));
      })
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, [range.from, range.to]);

  const { data, slopePerWeek, projectedNext } = useMemo(() => {
    if (!rows || rows.length === 0) return { data: [] as ChartPoint[], slopePerWeek: null, projectedNext: null };

    // Fill any week with no activity as $0 so every week appears on the axis.
    const byWeek = new Map(rows.map((r) => [toUtcMs(r.bucket), r.profit]));
    const starts = [...byWeek.keys()].sort((a, b) => a - b);
    const first = starts[0];
    const last = starts[starts.length - 1];
    const weeks: { ms: number; profit: number }[] = [];
    for (let ms = first; ms <= last; ms += WEEK_MS) weeks.push({ ms, profit: byWeek.get(ms) ?? 0 });

    // The week still in progress is incomplete, so it is shown but kept out of
    // the trend so it does not drag the line down.
    const lastWeek = weeks[weeks.length - 1];
    const lastIsPartial = lastWeek.ms + WEEK_MS > Date.now();
    const fitWeeks = lastIsPartial && weeks.length > 2 ? weeks.slice(0, -1) : weeks;
    const fit = linearFit(fitWeeks.map((w) => w.profit));

    const pts: ChartPoint[] = weeks.map((w, i) => ({
      label: weekLabel(w.ms),
      profit: w.profit,
      trend: fit ? fit.intercept + fit.slope * i : null,
      projected: null,
      partial: lastIsPartial && i === weeks.length - 1,
    }));

    let next: number | null = null;
    if (fit) {
      // Projection continues the trend line one week past the last week shown.
      const nextValue = fit.intercept + fit.slope * weeks.length;
      // Join the dashed projection to the last actual point.
      pts[pts.length - 1].projected = pts[pts.length - 1].profit;
      pts.push({ label: "Next wk", profit: null, trend: nextValue, projected: nextValue });
      next = nextValue;
    }

    return { data: pts, slopePerWeek: fit ? fit.slope : null, projectedNext: next };
  }, [rows]);

  const rising = slopePerWeek !== null && slopePerWeek >= 0;

  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3 mb-4">
        <div>
          <div className="font-display italic text-lg">Financial trajectory</div>
          <div className="text-xs text-[var(--ink-muted)]">
            Net profit week on week, with trend line (weeks start Monday)
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-[11px] text-[var(--ink-muted)]">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-0.5" style={{ background: "var(--accent)" }} /> Weekly profit
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-0 border-t-2 border-dotted" style={{ borderColor: "var(--ink-muted)" }} /> Trend
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 border-t border-dashed" style={{ borderColor: "var(--accent)" }} /> Next week
          </span>
        </div>
      </div>

      {slopePerWeek !== null && (
        <div className="mb-3 text-sm">
          <span style={{ color: rising ? "var(--revenue)" : "var(--cost)" }} className="font-medium">
            {rising ? "▲" : "▼"} Trend {rising ? "+" : "-"}${Math.abs(Math.round(slopePerWeek)).toLocaleString()} per week
          </span>
          {projectedNext !== null && (
            <span className="text-[var(--ink-muted)]"> · next week projected at {fmtMoney(projectedNext)}</span>
          )}
        </div>
      )}

      {error ? (
        <div className="text-sm text-[var(--ink-muted)] py-16 text-center">Could not load weekly data.</div>
      ) : rows === null ? (
        <div className="text-sm text-[var(--ink-muted)] py-16 text-center">Loading…</div>
      ) : data.length === 0 ? (
        <div className="text-sm text-[var(--ink-muted)] py-16 text-center">No data yet for this view.</div>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="var(--line)" vertical={false} />
            <ReferenceLine y={0} stroke="var(--line)" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "var(--ink-muted)" }}
              axisLine={{ stroke: "var(--line)" }}
              tickLine={false}
              interval="preserveStartEnd"
              minTickGap={24}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "var(--ink-muted)" }}
              axisLine={false}
              tickLine={false}
              width={64}
              tickFormatter={(v) => fmtMoney(Number(v))}
            />
            <Tooltip
              formatter={(value: any, name: any) => {
                const names: Record<string, string> = {
                  profit: "Weekly profit",
                  trend: "Trend",
                  projected: "Projected",
                };
                return [fmtMoney(Number(value)), names[name] ?? name];
              }}
              labelFormatter={(l, payload) => {
                const p: any = payload?.[0]?.payload;
                if (l === "Next wk") return "Next week (projected)";
                return `Week of ${l}${p?.partial ? " (in progress)" : ""}`;
              }}
              contentStyle={{ borderRadius: 10, border: "1px solid var(--line)", fontSize: 12 }}
            />
            <Line
              type="linear"
              dataKey="trend"
              stroke="var(--ink-muted)"
              strokeWidth={2}
              strokeDasharray="2 4"
              dot={false}
              activeDot={false}
              connectNulls
            />
            <Line
              type="monotone"
              dataKey="profit"
              stroke="var(--accent)"
              strokeWidth={2.5}
              dot={{ r: 3 }}
              connectNulls={false}
            />
            <Line
              type="monotone"
              dataKey="projected"
              stroke="var(--accent)"
              strokeWidth={2.5}
              strokeDasharray="5 5"
              dot={{ r: 3 }}
              connectNulls
            />
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
