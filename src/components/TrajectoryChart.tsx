"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  Cell,
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
  ghost: number | null; // next-week projection, drawn as a ghost bar
  partial?: boolean;
};

// A bar with rounded ends on the side away from zero (works for losses too).
function RoundedBar(props: any) {
  const { x, y, width, height, fill, stroke, strokeDasharray, strokeWidth, value, opacity } = props;
  if (!width || !height) return null;
  const top = Math.min(y, y + height);
  const h = Math.abs(height);
  if (h < 1) return <rect x={x} y={top} width={width} height={Math.max(h, 2)} fill={fill} opacity={opacity} />;
  const r = Math.min(10, width / 2, h);
  const neg = Number(Array.isArray(value) ? value[1] : value) < 0;
  const d = neg
    ? `M${x},${top} H${x + width} V${top + h - r} Q${x + width},${top + h} ${x + width - r},${top + h} H${x + r} Q${x},${top + h} ${x},${top + h - r} Z`
    : `M${x},${top + h} V${top + r} Q${x},${top} ${x + r},${top} H${x + width - r} Q${x + width},${top} ${x + width},${top + r} V${top + h} Z`;
  return <path d={d} fill={fill} stroke={stroke} strokeDasharray={strokeDasharray} strokeWidth={strokeWidth} opacity={opacity} />;
}

function TrendEnd(props: any) {
  const { cx, cy, index, dataLength, value } = props;
  if (index !== dataLength - 1 || cx == null || cy == null) return <g />;
  const text = `${value < 0 ? "-" : ""}$${Math.abs(Math.round(value)).toLocaleString()}`;
  const w = text.length * 7.2 + 18;
  const left = Math.max(4, cx - w - 8);
  return (
    <g>
      <circle cx={cx} cy={cy} r={9} fill="var(--ink)" opacity={0.12} />
      <circle cx={cx} cy={cy} r={4.5} fill="var(--surface)" stroke="var(--ink)" strokeWidth={2} />
      <g transform={`translate(${left}, ${cy - 36})`}>
        <rect width={w} height={22} rx={11} fill="var(--ink)" />
        <text x={w / 2} y={15} textAnchor="middle" fontSize={11} fontWeight={600} fill="#fff">
          {text}
        </text>
      </g>
    </g>
  );
}

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
      ghost: null,
      partial: lastIsPartial && i === weeks.length - 1,
    }));

    let next: number | null = null;
    if (fit) {
      // Projection continues the trend line one week past the last week shown.
      const nextValue = fit.intercept + fit.slope * weeks.length;
      // Join the dashed projection to the last actual point.
      pts.push({ label: "Next wk", profit: null, trend: nextValue, projected: nextValue, ghost: nextValue });
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
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: "var(--accent)" }} /> Profit
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: "var(--cost)" }} /> Loss
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-4 h-0.5 rounded" style={{ background: "var(--ink)" }} /> Trend
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm border border-dashed" style={{ borderColor: "var(--accent)", background: "var(--accent-soft)" }} /> Next week
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
        <ResponsiveContainer width="100%" height={320}>
          <ComposedChart data={data} margin={{ top: 40, right: 16, left: 0, bottom: 0 }} barCategoryGap="18%">
            <defs>
              <linearGradient id="barUp" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent)" stopOpacity={1} />
                <stop offset="100%" stopColor="var(--aqua)" stopOpacity={0.75} />
              </linearGradient>
              <linearGradient id="barDown" x1="0" y1="1" x2="0" y2="0">
                <stop offset="0%" stopColor="var(--cost)" stopOpacity={1} />
                <stop offset="100%" stopColor="var(--cost)" stopOpacity={0.45} />
              </linearGradient>
              <pattern id="ghostHatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="6" height="6" fill="var(--accent-soft)" />
                <line x1="0" y1="0" x2="0" y2="6" stroke="var(--accent)" strokeWidth="1.5" strokeOpacity="0.45" />
              </pattern>
              <filter id="trendGlow" x="-5%" y="-30%" width="110%" height="160%">
                <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#17181c" floodOpacity="0.28" />
              </filter>
            </defs>
            <CartesianGrid stroke="var(--line)" strokeDasharray="3 6" vertical={false} />
            <ReferenceLine y={0} stroke="var(--ink-muted)" strokeOpacity={0.5} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "var(--ink-muted)" }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
              minTickGap={24}
              tickMargin={8}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "var(--ink-muted)" }}
              axisLine={false}
              tickLine={false}
              width={64}
              tickFormatter={(v) => fmtMoney(Number(v))}
            />
            <Tooltip
              cursor={{ fill: "var(--accent-soft)", opacity: 0.6 }}
              content={({ active, payload, label }: any) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as ChartPoint;
                const isNext = label === "Next wk";
                const v = isNext ? p.ghost : p.profit;
                return (
                  <div
                    className="px-3 py-2 text-xs"
                    style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 12, boxShadow: "0 8px 24px rgba(23,24,28,0.12)" }}
                  >
                    <div className="text-[var(--ink-muted)] mb-1">
                      {isNext ? "Next week (projected)" : `Week of ${label}${p.partial ? " · in progress" : ""}`}
                    </div>
                    <div className="font-mono-num text-sm font-semibold" style={{ color: v !== null && v < 0 ? "var(--cost)" : "var(--accent)" }}>
                      {v !== null ? fmtMoney(v) : "–"}
                    </div>
                    {p.trend !== null && !isNext && (
                      <div className="text-[var(--ink-muted)] mt-1">Trend {fmtMoney(p.trend)}</div>
                    )}
                  </div>
                );
              }}
            />
            <Bar dataKey="profit" stackId="w" shape={<RoundedBar />} maxBarSize={30} isAnimationActive={false}>
              {data.map((d, i) => (
                <Cell
                  key={i}
                  fill={d.profit !== null && d.profit < 0 ? "url(#barDown)" : "url(#barUp)"}
                  opacity={d.partial ? 0.55 : 1}
                  stroke={d.partial ? (d.profit !== null && d.profit < 0 ? "var(--cost)" : "var(--accent)") : "none"}
                  strokeDasharray={d.partial ? "4 3" : undefined}
                />
              ))}
            </Bar>
            <Bar dataKey="ghost" stackId="w" shape={<RoundedBar />} maxBarSize={30} fill="url(#ghostHatch)" stroke="var(--accent)" strokeDasharray="4 3" strokeWidth={1.5} isAnimationActive={false} />
            <Line
              type="monotone"
              dataKey="trend"
              stroke="var(--ink)"
              strokeWidth={2.5}
              strokeLinecap="round"
              dot={(p: any) => <TrendEnd key={p.index} {...p} dataLength={data.length} />}
              activeDot={false}
              connectNulls
              style={{ filter: "url(#trendGlow)" }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
