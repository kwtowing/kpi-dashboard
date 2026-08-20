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
            `SELECT id, call_no, receive_date, garage, truck, driver_id, trouble_cd,
                    club_code, om_mileage, towed_kms_paid, towed_kms, subtotal, tax, total_cost
             FROM tow_calls
             WHERE total_cost = 0 AND receive_date >= $1 AND receive_date <= $2
             ORDER BY receive_date DESC
             LIMIT 200`,
            [from, to]
          )
        : await query(
            `SELECT id, call_no, receive_date, garage, truck, driver_id, trouble_cd,
                    club_code, om_mileage, towed_kms_paid, towed_kms, subtotal, tax, total_cost
             FROM tow_calls
             WHERE total_cost = 0
             ORDER BY receive_date DESC
             LIMIT 200`
          );
    return NextResponse.json({ count: rows.length, calls: rows });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
