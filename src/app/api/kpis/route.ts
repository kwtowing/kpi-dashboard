import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";


const PERIODS = ["day", "week", "month", "year"] as const;
type Period = (typeof PERIODS)[number];

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const period = (searchParams.get("period") ?? "month") as Period;
  const points = Number(searchParams.get("points") ?? 12);

  if (!PERIODS.includes(period)) {
    return NextResponse.json({ error: "invalid period" }, { status: 400 });
  }

  try {
    // Time-series: revenue vs cost per bucket, most recent N buckets
    const series = await query(
      `WITH buckets AS (
         SELECT date_trunc($1, entry_date) AS bucket,
                SUM(CASE WHEN kind = 'revenue' THEN amount ELSE 0 END) AS revenue,
                SUM(CASE WHEN kind = 'cost' THEN amount ELSE 0 END) AS cost
         FROM transactions
         GROUP BY 1
       )
       SELECT bucket, revenue, cost, (revenue - cost) AS profit
       FROM buckets
       ORDER BY bucket DESC
       LIMIT $2`,
      [period, points]
    );
    series.reverse();

    // Cost breakdown by category, most recent bucket only
    const breakdown = await query(
      `SELECT category, SUM(amount) AS amount
       FROM transactions
       WHERE kind = 'cost' AND entry_date >= date_trunc($1, now())
       GROUP BY category
       ORDER BY amount DESC
       LIMIT 8`,
      [period]
    );

    // Overall totals (all time) for KPI cards
    const totalsRows = await query<{ revenue: string; cost: string; count: string }>(
      `SELECT
         COALESCE(SUM(CASE WHEN kind = 'revenue' THEN amount ELSE 0 END), 0) AS revenue,
         COALESCE(SUM(CASE WHEN kind = 'cost' THEN amount ELSE 0 END), 0) AS cost,
         COUNT(*) AS count
       FROM transactions`
    );
    const totals = totalsRows[0];

    // Simple linear projection for the next bucket based on the trailing points
    const numeric = series.map((s: any) => Number(s.profit));
    let projectedNext: number | null = null;
    if (numeric.length >= 2) {
      const n = numeric.length;
      const xs = numeric.map((_: number, i: number) => i);
      const meanX = xs.reduce((a: number, b: number) => a + b, 0) / n;
      const meanY = numeric.reduce((a: number, b: number) => a + b, 0) / n;
      const slope =
        xs.reduce((acc: number, x: number, i: number) => acc + (x - meanX) * (numeric[i] - meanY), 0) /
        (xs.reduce((acc: number, x: number) => acc + (x - meanX) ** 2, 0) || 1);
      const intercept = meanY - slope * meanX;
      projectedNext = intercept + slope * n;
    }

    return NextResponse.json({
      period,
      series,
      breakdown,
      totals: {
        revenue: Number(totals.revenue),
        cost: Number(totals.cost),
        profit: Number(totals.revenue) - Number(totals.cost),
        count: Number(totals.count),
      },
      projectedNext,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
