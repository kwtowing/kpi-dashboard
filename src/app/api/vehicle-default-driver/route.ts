import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { ensureVehicleDriverTable, normalizeVehicle } from "@/lib/vehicleDriver";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await ensureVehicleDriverTable();
    const rows = await query(`SELECT vehicle_name, driver_name FROM vehicle_default_driver ORDER BY vehicle_name`);
    return NextResponse.json({ vehicles: rows });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// Set who drives a vehicle. An empty driver_name removes the assignment.
export async function POST(req: NextRequest) {
  try {
    const b = await req.json();
    const vehicle = normalizeVehicle(b.vehicle_name);
    const driver = String(b.driver_name ?? "").trim();
    if (!vehicle) {
      return NextResponse.json({ error: "vehicle_name is required" }, { status: 400 });
    }
    await ensureVehicleDriverTable();
    if (!driver) {
      await query(`DELETE FROM vehicle_default_driver WHERE vehicle_name = $1`, [vehicle]);
      return NextResponse.json({ ok: true, removed: true });
    }
    await query(
      `INSERT INTO vehicle_default_driver (vehicle_name, driver_name) VALUES ($1, $2)
       ON CONFLICT (vehicle_name) DO UPDATE SET driver_name = EXCLUDED.driver_name, updated_at = now()`,
      [vehicle, driver]
    );
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
