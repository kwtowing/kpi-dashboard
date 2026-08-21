import { NextResponse } from "next/server";
import { getCurrentDriverVehicleAssignments, SamsaraNotConfigured } from "@/lib/connectors/samsara";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rows = await query<{ samsara_driver_id: string }>(
      `SELECT samsara_driver_id FROM driver_master WHERE samsara_driver_id IS NOT NULL AND samsara_driver_id <> ''`
    );
    const driverIds = rows.map((r) => r.samsara_driver_id);

    const assignments = await getCurrentDriverVehicleAssignments(driverIds);
    return NextResponse.json({ connected: true, assignments });
  } catch (err: any) {
    if (err instanceof SamsaraNotConfigured) {
      return NextResponse.json({ connected: false, reason: "not_configured", assignments: [] });
    }
    return NextResponse.json(
      { connected: false, reason: "api_error", error: err.message, assignments: [] },
      { status: 200 }
    );
  }
}
