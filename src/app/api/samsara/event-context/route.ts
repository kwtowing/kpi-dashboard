import { NextRequest, NextResponse } from "next/server";
import {
  getGpsContext,
  getSpeedingContext,
  SamsaraNotConfigured,
  SamsaraSpeedLimitUnavailable,
} from "@/lib/connectors/samsara";

export const dynamic = "force-dynamic";

// Speed, street address and posted speed limit for one safety event. Speed and
// address come from the vehicle's GPS history at the moment it happened; the
// posted limit (and top speed) comes from Samsara's speeding intervals, and only
// exists when the vehicle was over the limit at that moment. The Driver
// Behaviour page calls this per event after the list has loaded, so the list
// itself appears straight away.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const vehicleId = searchParams.get("vehicleId") ?? "";
  const time = searchParams.get("time") ?? "";

  if (!/^\d+$/.test(vehicleId) || Number.isNaN(new Date(time).getTime())) {
    return NextResponse.json({ error: "vehicleId and time are required" }, { status: 400 });
  }

  try {
    const [gps, speeding] = await Promise.allSettled([
      getGpsContext(vehicleId, time),
      getSpeedingContext(vehicleId, time),
    ]);

    if (gps.status === "rejected") {
      const err = gps.reason;
      if (err instanceof SamsaraNotConfigured) return NextResponse.json({ error: "not_configured" });
      return NextResponse.json({ error: err?.message ?? "lookup failed" });
    }

    // The speed limit is optional: if that part fails (most often because the
    // API token lacks the speeding permission) the rest still comes back.
    let limit = { limitKmh: null as number | null, maxSpeedKmh: null as number | null, severity: null as string | null };
    let limitUnavailable: string | null = null;
    if (speeding.status === "fulfilled") {
      limit = speeding.value;
    } else {
      const reason = speeding.reason;
      limitUnavailable = reason instanceof SamsaraSpeedLimitUnavailable ? reason.message : "error";
    }

    // Recent events can still gain speeding data once the trip ends, so only
    // let the browser keep the answer for long once the event is a few hours old.
    const ageMs = Date.now() - new Date(time).getTime();
    const maxAge = limitUnavailable || ageMs < 3 * 60 * 60 * 1000 ? 300 : 86400;

    return NextResponse.json(
      { ...gps.value, ...limit, limitUnavailable },
      { headers: { "Cache-Control": `private, max-age=${maxAge}` } }
    );
  } catch (err: any) {
    return NextResponse.json({ error: err.message });
  }
}
