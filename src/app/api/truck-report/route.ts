import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rows = await query(
      `SELECT
         tc.truck,
         COUNT(*) AS call_count,
         COALESCE(SUM(tc.towed_kms_paid), 0) AS km_paid,
         COALESCE(SUM(tc.total_cost), 0) AS total_cost,
         MAX(tc.receive_date) AS last_used,
         tm.samsara_name
       FROM tow_calls tc
       LEFT JOIN truck_master tm ON tm.truck_number = tc.truck
       WHERE tc.truck IS NOT NULL
       GROUP BY tc.truck, tm.samsara_name
       ORDER BY total_cost DESC`
    );
    return NextResponse.json({ rows });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
