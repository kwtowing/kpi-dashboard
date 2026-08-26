import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

const PERIODS = ["day", "week", "month", "year"] as const;
type Period = (typeof PERIODS)[number];

// A single combined view of every revenue/cost entry, regardless of source:
// CAA calls (tow_calls.total_cost, always revenue) plus manual entries and
// CSV imports (transactions). tow_calls is the live source of truth for CAA
// data — no separate copy is kept in transactions, so a corrected re-import
// is reflected here immediately.
const COMBINED_CTE = `
  WITH combined AS (
    SELECT entry_date AS d, kind, amount, category FROM transactions
    UNION ALL
    SELECT receive_date AS d, 'revenue' AS kind, total_cost AS amount, 'CAA Towing' AS category
    FROM tow_calls WHERE total_cost IS NOT NULL
  )
`;

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
          `${COMBINED_CTE}
           , buckets AS (
             SELECT date_trunc($1, d) AS bucket,
                    SUM(CASE WHEN kind = 'revenue' THEN amount ELSE 0 END) AS revenue,
                    SUM(CASE WHEN kind = 'cost' THEN amount ELSE 0 END) AS cost
             FROM combined
             WHERE d >= $2 AND d <= $3
             GROUP BY 1
           )
           SELECT bucket, revenue, cost, (revenue - cost) AS profit
           FROM buckets
           ORDER BY bucket ASC`,
          [period, from, to]
        )
      : await query(
          `${COMBINED_CTE}
           , buckets AS (
             SELECT date_trunc($1, d) AS bucket,
                    SUM(CASE WHEN kind = 'revenue' THEN amount ELSE 0 END) AS revenue,
                    SUM(CASE WHEN kind = 'cost' THEN amount ELSE 0 END) AS cost
             FROM combined
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
    // otherwise the current period (e.g. this month). Costs only come from
    // transactions (manual/CSV) — tow_calls has no cost side, only revenue.
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
          `${COMBINED_CTE}
           SELECT
             COALESCE(SUM(CASE WHEN kind = 'revenue' THEN amount ELSE 0 END), 0) AS revenue,
             COALESCE(SUM(CASE WHEN kind = 'cost' THEN amount ELSE 0 END), 0) AS cost,
             COUNT(*) AS count
           FROM combined
           WHERE d >= $1 AND d <= $2`,
          [from, to]
        )
      : await query<{ revenue: string; cost: string; count: string }>(
          `${COMBINED_CTE}
           SELECT
             COALESCE(SUM(CASE WHEN kind = 'revenue' THEN amount ELSE 0 END), 0) AS revenue,
             COALESCE(SUM(CASE WHEN kind = 'cost' THEN amount ELSE 0 END), 0) AS cost,
             COUNT(*) AS count
           FROM combined`
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
