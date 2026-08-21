import { NextResponse } from "next/server";
import { listDrivers, SamsaraNotConfigured } from "@/lib/connectors/samsara";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const drivers = await listDrivers();
    return NextResponse.json({ connected: true, drivers });
  } catch (err: any) {
    if (err instanceof SamsaraNotConfigured) {
      return NextResponse.json({ connected: false, reason: "not_configured", drivers: [] });
    }
    return NextResponse.json(
      { connected: false, reason: "api_error", error: err.message, drivers: [] },
      { status: 200 }
    );
  }
}
