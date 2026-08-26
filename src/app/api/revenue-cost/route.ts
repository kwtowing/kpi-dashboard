import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

const AVG_DAYS_PER_MONTH = 30.4368; // 365.24 / 12

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const hasRange = Boolean(from && to);

  try {
    // Driver labour cost:
    // - Hourly drivers: call duration (RE DT -> CL DT) x hourly rate.
    // - Salaried drivers: monthly salary, prorated to the days actually
    //   covered — the selected date range if one is set, otherwise the
    //   span between that driver's first and last call in the data.
    const driverRows = hasRange
      ? await query(
          `SELECT
             tc.driver_id,
             dm.driver_name,
             dm.hourly_rate,
             dm.monthly_salary,
             dm.compensation_type,
             COUNT(*) AS calls,
             COALESCE(SUM(tc.total_cost), 0) AS revenue,
             COALESCE(SUM(
               CASE WHEN tc.re_dt IS NOT NULL AND tc.cl_dt IS NOT NULL AND tc.cl_dt > tc.re_dt
                 THEN EXTRACT(EPOCH FROM (tc.cl_dt - tc.re_dt)) / 3600.0
                 ELSE 0 END
             ), 0) AS hours,
             COUNT(*) FILTER (WHERE tc.re_dt IS NULL OR tc.cl_dt IS NULL) AS calls_missing_times,
             ($2::date - $1::date + 1) AS span_days
           FROM tow_calls tc
           LEFT JOIN driver_master dm ON dm.driver_id = tc.driver_id
           WHERE tc.driver_id IS NOT NULL AND tc.receive_date >= $1 AND tc.receive_date <= $2
           GROUP BY tc.driver_id, dm.driver_name, dm.hourly_rate, dm.monthly_salary, dm.compensation_type
           ORDER BY revenue DESC`,
          [from, to]
        )
      : await query(
          `SELECT
             tc.driver_id,
             dm.driver_name,
             dm.hourly_rate,
             dm.monthly_salary,
             dm.compensation_type,
             COUNT(*) AS calls,
             COALESCE(SUM(tc.total_cost), 0) AS revenue,
             COALESCE(SUM(
               CASE WHEN tc.re_dt IS NOT NULL AND tc.cl_dt IS NOT NULL AND tc.cl_dt > tc.re_dt
                 THEN EXTRACT(EPOCH FROM (tc.cl_dt - tc.re_dt)) / 3600.0
                 ELSE 0 END
             ), 0) AS hours,
             COUNT(*) FILTER (WHERE tc.re_dt IS NULL OR tc.cl_dt IS NULL) AS calls_missing_times,
             (MAX(tc.receive_date) - MIN(tc.receive_date) + 1) AS span_days
           FROM tow_calls tc
           LEFT JOIN driver_master dm ON dm.driver_id = tc.driver_id
           WHERE tc.driver_id IS NOT NULL
           GROUP BY tc.driver_id, dm.driver_name, dm.hourly_rate, dm.monthly_salary, dm.compensation_type
           ORDER BY revenue DESC`
        );

    const drivers = driverRows.map((d: any) => {
      const hours = Number(d.hours);
      const revenue = Number(d.revenue);
      const spanDays = Number(d.span_days) || 1;
      const isSalary = d.compensation_type === "salary" && d.monthly_salary !== null;

      let labourCost: number | null = null;
      let rateDisplay: number | null = null;
      if (isSalary) {
        labourCost = Number(d.monthly_salary) * (spanDays / AVG_DAYS_PER_MONTH);
        rateDisplay = Number(d.monthly_salary);
      } else if (d.hourly_rate !== null) {
        labourCost = hours * Number(d.hourly_rate);
        rateDisplay = Number(d.hourly_rate);
      }

      return {
        driver_id: d.driver_id,
        driver_name: d.driver_name,
        calls: Number(d.calls),
        revenue,
        hours: Math.round(hours * 10) / 10,
        compensation_type: d.compensation_type ?? "hourly",
        rate: rateDisplay,
        labour_cost: labourCost !== null ? Math.round(labourCost * 100) / 100 : null,
        contribution: labourCost !== null ? Math.round((revenue - labourCost) * 100) / 100 : null,
        calls_missing_times: Number(d.calls_missing_times),
      };
    });

    const truckRows = hasRange
      ? await query(
          `SELECT truck, COUNT(*) AS calls, COALESCE(SUM(total_cost), 0) AS revenue, COALESCE(SUM(towed_kms_paid), 0) AS km_paid
           FROM tow_calls
           WHERE truck IS NOT NULL AND receive_date >= $1 AND receive_date <= $2
           GROUP BY truck
           ORDER BY revenue DESC`,
          [from, to]
        )
      : await query(
          `SELECT truck, COUNT(*) AS calls, COALESCE(SUM(total_cost), 0) AS revenue, COALESCE(SUM(towed_kms_paid), 0) AS km_paid
           FROM tow_calls
           WHERE truck IS NOT NULL
           GROUP BY truck
           ORDER BY revenue DESC`
        );

    return NextResponse.json({ drivers, trucks: truckRows, range: hasRange ? { from, to } : null });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
