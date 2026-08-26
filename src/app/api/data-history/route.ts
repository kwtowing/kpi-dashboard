import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rows = await query<{ total_calls: string; earliest: string | null; latest: string | null; total_revenue: string }>(
      `SELECT COUNT(*) AS total_calls, MIN(receive_date) AS earliest, MAX(receive_date) AS latest,
              COALESCE(SUM(total_cost), 0) AS total_revenue
       FROM tow_calls`
    );
    const r = rows[0];
    return NextResponse.json({
      total_calls: Number(r.total_calls),
      earliest: r.earliest,
      latest: r.latest,
      total_revenue: Number(r.total_revenue),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
