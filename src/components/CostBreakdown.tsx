"use client";

import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";

export default function CostBreakdown({
  breakdown,
}: {
  breakdown: { category: string; amount: number }[];
}) {
  const data = breakdown.map((b) => ({ category: b.category, amount: Number(b.amount) }));

  return (
    <div className="card p-5">
      <div className="font-display italic text-lg mb-1">Cost breakdown</div>
      <div className="text-xs text-[var(--ink-muted)] mb-4">By category, current period</div>
      {data.length === 0 ? (
        <div className="text-sm text-[var(--ink-muted)] py-10 text-center">
          No cost entries yet for this period.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={data} layout="vertical" margin={{ left: 10, right: 20 }}>
            <CartesianGrid stroke="var(--line)" horizontal={false} />
            <XAxis
              type="number"
              tick={{ fontSize: 11, fill: "var(--ink-muted)" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `$${Number(v).toLocaleString()}`}
            />
            <YAxis
              type="category"
              dataKey="category"
              tick={{ fontSize: 12, fill: "var(--ink)" }}
              axisLine={false}
              tickLine={false}
              width={110}
            />
            <Tooltip
              formatter={(value: any) => [`$${Number(value).toLocaleString()}`, "Cost"]}
              contentStyle={{ borderRadius: 10, border: "1px solid var(--line)", fontSize: 12 }}
            />
            <Bar dataKey="amount" fill="var(--cost)" radius={[0, 6, 6, 0]} barSize={16} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
