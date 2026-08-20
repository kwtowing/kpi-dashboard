import { NextResponse } from "next/server";
import { listVehiclesWithStats, SamsaraNotConfigured } from "@/lib/connectors/samsara";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const vehicles = await listVehiclesWithStats();
    return NextResponse.json({ connected: true, vehicles });
  } catch (err: any) {
    if (err instanceof SamsaraNotConfigured) {
      return NextResponse.json({ connected: false, vehicles: [] });
    }
    return NextResponse.json({ connected: false, vehicles: [], error: err.message }, { status: 500 });
  }
}
