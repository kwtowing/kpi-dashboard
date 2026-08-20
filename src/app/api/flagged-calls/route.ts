import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rows = await query(
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
