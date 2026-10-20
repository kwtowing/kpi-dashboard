import { NextRequest, NextResponse } from "next/server";
import { getGpsContext, SamsaraNotConfigured } from "@/lib/connectors/samsara";

export const dynamic = "force-dynamic";

// Speed and street address for one safety event, taken from the vehicle's GPS
// history at the moment it happened. The Driver Behaviour page calls this per
// event after the list has loaded, so the list itself appears straight away.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const vehicleId = searchParams.get("vehicleId") ?? "";
  const time = searchParams.get("time") ?? "";

  if (!/^\d+$/.test(vehicleId) || Number.isNaN(new Date(time).getTime())) {
    return NextResponse.json({ error: "vehicleId and time are required" }, { status: 400 });
  }

  try {
    const ctx = await getGpsContext(vehicleId, time);
    return NextResponse.json(ctx, {
      // A past event never changes, so the browser can keep the answer.
      headers: { "Cache-Control": "private, max-age=86400" },
    });
  } catch (err: any) {
    if (err instanceof SamsaraNotConfigured) {
      return NextResponse.json({ error: "not_configured" }, { status: 200 });
    }
    return NextResponse.json({ error: err.message }, { status: 200 });
  }
}
