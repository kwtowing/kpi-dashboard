import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const drivers = await query(
      `SELECT * FROM driver_master ORDER BY driver_name NULLS LAST, driver_id`
    );
    return NextResponse.json({ drivers });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const b = await req.json();
    if (!b.driver_id) {
      return NextResponse.json({ error: "driver_id is required" }, { status: 400 });
    }
    const rows = await query(
      `INSERT INTO driver_master (driver_id, driver_name, samsara_driver_id, hourly_rate, compensation_type, status)
       VALUES ($1, $2, $3, $4, $5, COALESCE($6, 'active'))
       ON CONFLICT (driver_id) DO UPDATE SET
         driver_name = EXCLUDED.driver_name,
         samsara_driver_id = EXCLUDED.samsara_driver_id,
         hourly_rate = EXCLUDED.hourly_rate,
         compensation_type = EXCLUDED.compensation_type,
         status = EXCLUDED.status,
         updated_at = now()
       RETURNING *`,
      [b.driver_id, b.driver_name ?? null, b.samsara_driver_id ?? null, b.hourly_rate ?? null, b.compensation_type ?? "hourly", b.status ?? null]
    );
    return NextResponse.json({ ok: true, driver: rows[0] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
