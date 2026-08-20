import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const byCode = await query(
      `SELECT
         COALESCE(trouble_cd, 'Uncoded') AS trouble_cd,
         COUNT(*) AS calls,
         COALESCE(SUM(total_cost), 0) AS gross_revenue,
         COALESCE(SUM(tax), 0) AS tax,
         COALESCE(SUM(subtotal), 0) AS net_revenue,
         COUNT(*) FILTER (WHERE total_cost = 0) AS zero_paid
       FROM tow_calls
       GROUP BY trouble_cd
       ORDER BY gross_revenue DESC`
    );

    const totals = await query(
      `SELECT
         COUNT(*) AS calls,
         COALESCE(SUM(total_cost), 0) AS gross_revenue,
         COALESCE(SUM(tax), 0) AS tax,
         COALESCE(SUM(subtotal), 0) AS net_revenue,
         COUNT(*) FILTER (WHERE total_cost = 0) AS zero_paid
       FROM tow_calls`
    );

    return NextResponse.json({ byCode, totals: totals[0] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
