import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const truck = searchParams.get("truck");

  if (!truck) {
    return NextResponse.json({ error: "truck is required" }, { status: 400 });
  }

  try {
    const rows = await query(
      `SELECT
         driver_id,
         COUNT(*) AS calls,
         COALESCE(SUM(total_cost), 0) AS revenue,
         COALESCE(SUM(towed_kms_paid), 0) AS km_paid
       FROM tow_calls
       WHERE truck = $1 AND driver_id IS NOT NULL
       GROUP BY driver_id
       ORDER BY revenue DESC`,
      [truck]
    );
    return NextResponse.json({ truck, drivers: rows });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
