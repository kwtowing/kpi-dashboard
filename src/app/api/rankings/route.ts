import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const driverRankings = await query(
      `SELECT
         driver_id,
         COUNT(*) AS calls,
         COALESCE(SUM(total_cost), 0) AS revenue,
         COALESCE(SUM(towed_kms_paid), 0) AS km_paid,
         CASE WHEN COALESCE(SUM(towed_kms_paid), 0) > 0
           THEN SUM(total_cost) / SUM(towed_kms_paid) ELSE NULL END AS revenue_per_km,
         COUNT(*) FILTER (WHERE total_cost = 0) AS zero_paid_calls
       FROM tow_calls
       WHERE driver_id IS NOT NULL
       GROUP BY driver_id
       ORDER BY revenue DESC`
    );

    const truckRankings = await query(
      `SELECT
         truck,
         COUNT(*) AS calls,
         COALESCE(SUM(total_cost), 0) AS revenue,
         COALESCE(SUM(towed_kms_paid), 0) AS km_paid,
         CASE WHEN COALESCE(SUM(towed_kms_paid), 0) > 0
           THEN SUM(total_cost) / SUM(towed_kms_paid) ELSE NULL END AS revenue_per_km,
         COUNT(*) FILTER (WHERE total_cost = 0) AS zero_paid_calls
       FROM tow_calls
       WHERE truck IS NOT NULL
       GROUP BY truck
       ORDER BY revenue DESC`
    );

    return NextResponse.json({ drivers: driverRankings, trucks: truckRankings });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
