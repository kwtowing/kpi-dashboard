"use client";

import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";

type SeriesPoint = {
  bucket: string;
  revenue: number;
  cost: number;
  profit: number;
};

function labelFor(bucket: string, period: string) {
  const d = new Date(bucket);
  if (period === "day") return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  if (period === "week") return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  if (period === "month") return d.toLocaleDateString(undefined, { month: "short", year: "2-digit" });
  return d.getFullYear().toString();
}

export default function TrajectoryChart({
  series,
  period,
  projectedNext,
}: {
  series: SeriesPoint[];
  period: string;
  projectedNext: number | null;
}) {
  const data = series.map((s) => ({
    label: labelFor(s.bucket, period),
    profit: Number(s.profit),
    projected: null as number | null,
  }));

  if (projectedNext !== null && data.length > 0) {
    // connect the last actual point to the projected point
    data[data.length - 1].projected = data[data.length - 1].profit;
    data.push({ label: "Next", profit: null as any, projected: projectedNext });
  }

  return (
    <div className="card p-5">
      <div className="flex items-baseline justify-between mb-4">
        <div>
          <div className="font-display italic text-lg">Financial trajectory</div>
          <div className="text-xs text-[var(--ink-muted)]">
            Net profit, actual vs. projected next {period}
          </div>
        </div>
        <div className="flex items-center gap-4 text-[11px] text-[var(--ink-muted)]">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-0.5" style={{ background: "var(--accent)" }} /> Actual
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 border-t border-dashed" style={{ borderColor: "var(--accent)" }} /> Projected
          </span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--line)" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: "var(--ink-muted)" }}
            axisLine={{ stroke: "var(--line)" }}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "var(--ink-muted)" }}
            axisLine={false}
            tickLine={false}
            width={60}
            tickFormatter={(v) => `$${Number(v).toLocaleString()}`}
          />
          <Tooltip
            formatter={(value: any) => [`$${Number(value).toLocaleString()}`, ""]}
            contentStyle={{
              borderRadius: 10,
              border: "1px solid var(--line)",
              fontSize: 12,
            }}
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
    </div>
  );
}
