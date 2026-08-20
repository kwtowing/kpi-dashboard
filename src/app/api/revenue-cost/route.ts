import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Driver labour cost estimated from call duration (RE DT -> CL DT) x hourly rate.
    // Calls with no timestamps or no configured rate simply contribute $0 labour cost
    // (shown separately so it's clear when a number is incomplete vs. genuinely zero).
    const driverRows = await query(
      `SELECT
         tc.driver_id,
         dm.driver_name,
         dm.hourly_rate,
         COUNT(*) AS calls,
         COALESCE(SUM(tc.total_cost), 0) AS revenue,
         COALESCE(SUM(
           CASE WHEN tc.re_dt IS NOT NULL AND tc.cl_dt IS NOT NULL AND tc.cl_dt > tc.re_dt
             THEN EXTRACT(EPOCH FROM (tc.cl_dt - tc.re_dt)) / 3600.0
             ELSE 0 END
         ), 0) AS hours,
         COUNT(*) FILTER (WHERE tc.re_dt IS NULL OR tc.cl_dt IS NULL) AS calls_missing_times
       FROM tow_calls tc
       LEFT JOIN driver_master dm ON dm.driver_id = tc.driver_id
       WHERE tc.driver_id IS NOT NULL
       GROUP BY tc.driver_id, dm.driver_name, dm.hourly_rate
       ORDER BY revenue DESC`
    );

    const drivers = driverRows.map((d: any) => {
      const hours = Number(d.hours);
      const rate = d.hourly_rate !== null ? Number(d.hourly_rate) : null;
      const labourCost = rate !== null ? hours * rate : null;
      const revenue = Number(d.revenue);
      return {
        driver_id: d.driver_id,
        driver_name: d.driver_name,
        calls: Number(d.calls),
        revenue,
        hours: Math.round(hours * 10) / 10,
        hourly_rate: rate,
        labour_cost: labourCost !== null ? Math.round(labourCost * 100) / 100 : null,
        contribution: labourCost !== null ? Math.round((revenue - labourCost) * 100) / 100 : null,
        calls_missing_times: Number(d.calls_missing_times),
      };
    });

    const truckRows = await query(
      `SELECT
         truck,
         COUNT(*) AS calls,
         COALESCE(SUM(total_cost), 0) AS revenue,
         COALESCE(SUM(towed_kms_paid), 0) AS km_paid
       FROM tow_calls
       WHERE truck IS NOT NULL
       GROUP BY truck
       ORDER BY revenue DESC`
    );

    return NextResponse.json({ drivers, trucks: truckRows });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
