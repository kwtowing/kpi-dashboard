import { NextResponse } from "next/server";
import { getCurrentDriverVehicleAssignments, SamsaraNotConfigured } from "@/lib/connectors/samsara";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const assignments = await getCurrentDriverVehicleAssignments();
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
