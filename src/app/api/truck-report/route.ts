import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  try {
    const rows =
      from && to
        ? await query(
            `SELECT
               tc.truck,
               COUNT(*) AS call_count,
               COALESCE(SUM(tc.towed_kms_paid), 0) AS km_paid,
               COALESCE(SUM(tc.total_cost), 0) AS total_cost,
               MAX(tc.receive_date) AS last_used,
               tm.samsara_name,
               (
                 SELECT t2.driver_id FROM tow_calls t2
                 WHERE t2.truck = tc.truck AND t2.driver_id IS NOT NULL
                 ORDER BY t2.receive_date DESC LIMIT 1
               ) AS recent_driver_id
             FROM tow_calls tc
             LEFT JOIN truck_master tm ON tm.truck_number = tc.truck
             WHERE tc.truck IS NOT NULL AND tc.receive_date >= $1 AND tc.receive_date <= $2
             GROUP BY tc.truck, tm.samsara_name
             ORDER BY total_cost DESC`,
            [from, to]
          )
        : await query(
            `SELECT
               tc.truck,
               COUNT(*) AS call_count,
               COALESCE(SUM(tc.towed_kms_paid), 0) AS km_paid,
               COALESCE(SUM(tc.total_cost), 0) AS total_cost,
               MAX(tc.receive_date) AS last_used,
               tm.samsara_name,
               (
                 SELECT t2.driver_id FROM tow_calls t2
                 WHERE t2.truck = tc.truck AND t2.driver_id IS NOT NULL
                 ORDER BY t2.receive_date DESC LIMIT 1
               ) AS recent_driver_id
             FROM tow_calls tc
             LEFT JOIN truck_master tm ON tm.truck_number = tc.truck
             WHERE tc.truck IS NOT NULL
             GROUP BY tc.truck, tm.samsara_name
             ORDER BY total_cost DESC`
          );
    return NextResponse.json({ rows, range: from && to ? { from, to } : null });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
