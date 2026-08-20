import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

const PERIODS = ["day", "week", "month", "year"] as const;
type Period = (typeof PERIODS)[number];

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const period = (searchParams.get("period") ?? "month") as Period;
  const points = Number(searchParams.get("points") ?? 12);
  const from = searchParams.get("from"); // YYYY-MM-DD, optional
  const to = searchParams.get("to"); // YYYY-MM-DD, optional
  const hasRange = Boolean(from && to);

  if (!PERIODS.includes(period)) {
    return NextResponse.json({ error: "invalid period" }, { status: 400 });
  }

  try {
    // Time-series: revenue vs cost per bucket.
    // With a custom range: every bucket inside that range, oldest first.
    // Without one: the most recent N buckets, all time.
    const series = hasRange
      ? await query(
          `WITH buckets AS (
             SELECT date_trunc($1, entry_date) AS bucket,
                    SUM(CASE WHEN kind = 'revenue' THEN amount ELSE 0 END) AS revenue,
                    SUM(CASE WHEN kind = 'cost' THEN amount ELSE 0 END) AS cost
             FROM transactions
             WHERE entry_date >= $2 AND entry_date <= $3
             GROUP BY 1
           )
           SELECT bucket, revenue, cost, (revenue - cost) AS profit
           FROM buckets
           ORDER BY bucket ASC`,
          [period, from, to]
        )
      : await query(
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
    if (!hasRange) series.reverse();

    // Cost breakdown by category: within the custom range if given,
    // otherwise the current period (e.g. this month).
    const breakdown = hasRange
      ? await query(
          `SELECT category, SUM(amount) AS amount
           FROM transactions
           WHERE kind = 'cost' AND entry_date >= $1 AND entry_date <= $2
           GROUP BY category
           ORDER BY amount DESC
           LIMIT 8`,
          [from, to]
        )
      : await query(
          `SELECT category, SUM(amount) AS amount
           FROM transactions
           WHERE kind = 'cost' AND entry_date >= date_trunc($1, now())
           GROUP BY category
           ORDER BY amount DESC
           LIMIT 8`,
          [period]
        );

    // Totals for the KPI cards: within the range if given, else all time.
    const totalsRows = hasRange
      ? await query<{ revenue: string; cost: string; count: string }>(
          `SELECT
             COALESCE(SUM(CASE WHEN kind = 'revenue' THEN amount ELSE 0 END), 0) AS revenue,
             COALESCE(SUM(CASE WHEN kind = 'cost' THEN amount ELSE 0 END), 0) AS cost,
             COUNT(*) AS count
           FROM transactions
           WHERE entry_date >= $1 AND entry_date <= $2`,
          [from, to]
        )
      : await query<{ revenue: string; cost: string; count: string }>(
          `SELECT
             COALESCE(SUM(CASE WHEN kind = 'revenue' THEN amount ELSE 0 END), 0) AS revenue,
             COALESCE(SUM(CASE WHEN kind = 'cost' THEN amount ELSE 0 END), 0) AS cost,
             COUNT(*) AS count
           FROM transactions`
        );
    const totals = totalsRows[0];

    // Simple linear projection for the next bucket based on the trailing points.
    // Not meaningful with only a couple of buckets in a narrow custom range.
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
      range: hasRange ? { from, to } : null,
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
