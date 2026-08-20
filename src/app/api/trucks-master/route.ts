import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const trucks = await query(
      `SELECT * FROM truck_master ORDER BY truck_number`
    );
    return NextResponse.json({ trucks });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const b = await req.json();
    if (!b.truck_number) {
      return NextResponse.json({ error: "truck_number is required" }, { status: 400 });
    }
    const rows = await query(
      `INSERT INTO truck_master (truck_number, unit_number, plate, vehicle_class, samsara_vehicle_id, samsara_name, status)
       VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, 'active'))
       ON CONFLICT (truck_number) DO UPDATE SET
         unit_number = EXCLUDED.unit_number,
         plate = EXCLUDED.plate,
         vehicle_class = EXCLUDED.vehicle_class,
         samsara_vehicle_id = EXCLUDED.samsara_vehicle_id,
         samsara_name = EXCLUDED.samsara_name,
         status = EXCLUDED.status,
         updated_at = now()
       RETURNING *`,
      [
        b.truck_number,
        b.unit_number ?? null,
        b.plate ?? null,
        b.vehicle_class ?? null,
        b.samsara_vehicle_id ?? null,
        b.samsara_name ?? null,
        b.status ?? null,
      ]
    );
    return NextResponse.json({ ok: true, truck: rows[0] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
