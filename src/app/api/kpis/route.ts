import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

const PERIODS = ["day", "week", "month", "year"] as const;
type Period = (typeof PERIODS)[number];

// A single combined view of every revenue/cost entry, regardless of source:
//   - Revenue: CAA calls (tow_calls.total_cost) plus manual/CSV revenue entries.
//   - Cost: manual/CSV cost entries, PLUS real driver labour cost computed
//     automatically from driver_master:
//       - Hourly drivers: each call's duration (RE DT -> CL DT) x hourly rate,
//         attributed to that call's date.
//       - Salaried drivers: their monthly salary, spread evenly across the
//         days they actually had calls that month (not a manual entry —
//         this is why "Total cost" now reflects real payroll instead of
//         staying at $0 for anyone who hasn't logged manual expenses).
// tow_calls is the live source of truth for CAA data, so a corrected
// re-import is reflected here immediately, no separate copy kept anywhere.
const COMBINED_CTE = `
  WITH combined AS (
    SELECT entry_date AS d, kind, amount, category FROM transactions

    UNION ALL
    SELECT receive_date AS d, 'revenue' AS kind, total_cost AS amount, 'CAA Towing' AS category
    FROM tow_calls WHERE total_cost IS NOT NULL

    UNION ALL
    SELECT tc.receive_date AS d, 'cost' AS kind,
           (EXTRACT(EPOCH FROM (tc.cl_dt - tc.re_dt)) / 3600.0) * dm.hourly_rate AS amount,
           'Driver labour' AS category
    FROM tow_calls tc
    JOIN driver_master dm ON dm.driver_id = tc.driver_id
    WHERE dm.compensation_type = 'hourly' AND dm.hourly_rate IS NOT NULL
      AND tc.re_dt IS NOT NULL AND tc.cl_dt IS NOT NULL AND tc.cl_dt > tc.re_dt

    UNION ALL
    SELECT ad.receive_date AS d, 'cost' AS kind,
           dm.monthly_salary / ad.active_days_in_month AS amount,
           'Driver labour' AS category
    FROM driver_master dm
    JOIN (
      SELECT driver_id, receive_date,
             COUNT(*) OVER (PARTITION BY driver_id, date_trunc('month', receive_date)) AS active_days_in_month
      FROM (SELECT DISTINCT driver_id, receive_date FROM tow_calls WHERE driver_id IS NOT NULL) x
    ) ad ON ad.driver_id = dm.driver_id
    WHERE dm.compensation_type = 'salary' AND dm.monthly_salary IS NOT NULL
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
    // Without one: the most recent N+1 buckets (one extra so the last two
    // can be compared for a "vs previous period" delta), all time.
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
          [period, points + 1]
        );
    if (!hasRange) series.reverse();

    // Cost breakdown by category: within the custom range if given,
    // otherwise the current period (e.g. this month). Includes the
    // computed driver labour cost alongside any manual/CSV cost entries.
    const breakdown = hasRange
      ? await query(
          `${COMBINED_CTE}
           SELECT category, SUM(amount) AS amount
           FROM combined
           WHERE kind = 'cost' AND d >= $1 AND d <= $2
           GROUP BY category
           ORDER BY amount DESC
           LIMIT 8`,
          [from, to]
        )
      : await query(
          `${COMBINED_CTE}
           SELECT category, SUM(amount) AS amount
           FROM combined
           WHERE kind = 'cost' AND d >= date_trunc($1, now())
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

    // Previous-period comparison: the last two buckets in the series (when
    // there's no custom range) give "this period" vs "the one before it".
    let comparison: { revenue: number; cost: number; profit: number } | null = null;
    let trimmedSeries = series;
    if (!hasRange && series.length >= 2) {
      const prev = series[series.length - 2];
      const curr = series[series.length - 1];
      const pctChange = (a: number, b: number) => (a === 0 ? null : ((b - a) / Math.abs(a)) * 100);
      comparison = {
        revenue: pctChange(Number(prev.revenue), Number(curr.revenue)) as any,
        cost: pctChange(Number(prev.cost), Number(curr.cost)) as any,
        profit: pctChange(Number(prev.profit), Number(curr.profit)) as any,
      };
      // Trim back down to the requested number of points for the chart.
      trimmedSeries = series.slice(Math.max(0, series.length - points));
    }

    // Simple linear projection for the next bucket based on the trailing points.
    // Not meaningful with only a couple of buckets in a narrow custom range.
    const numeric = trimmedSeries.map((s: any) => Number(s.profit));
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
      series: trimmedSeries,
      breakdown,
      totals: {
        revenue: Number(totals.revenue),
        cost: Number(totals.cost),
        profit: Number(totals.revenue) - Number(totals.cost),
        count: Number(totals.count),
      },
      comparison,
      projectedNext,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
