import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rows = await query(
      `SELECT
         truck,
         COUNT(*) AS call_count,
         COALESCE(SUM(towed_kms_paid), 0) AS km_paid,
         COALESCE(SUM(total_cost), 0) AS total_cost,
         MAX(receive_date) AS last_used
       FROM tow_calls
       WHERE truck IS NOT NULL
       GROUP BY truck
       ORDER BY total_cost DESC`
    );
    return NextResponse.json({ rows });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
