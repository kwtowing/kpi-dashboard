import { NextRequest, NextResponse } from "next/server";
export const dynamic = "force-dynamic";
// Temporary diagnostic: raw Samsara driver-assignment responses for one vehicle.
export async function GET(req: NextRequest) {
  const token = process.env.SAMSARA_API_TOKEN;
  if (!token) return NextResponse.json({ error: "no token" });
  const v = new URL(req.url).searchParams.get("v") ?? "281474989042253";
  const end = new Date();
  const start = new Date(end.getTime() - 3 * 86400000);
  const out: any = {};
  const tries: Record<string, string> = {
    byVehicle: `https://api.samsara.com/fleet/driver-vehicle-assignments?filterBy=vehicles&vehicleIds=${v}&startTime=${start.toISOString()}&endTime=${end.toISOString()}`,
    byVehicleNoTimes: `https://api.samsara.com/fleet/driver-vehicle-assignments?filterBy=vehicles&vehicleIds=${v}`,
    vehicleStatsDriver: `https://api.samsara.com/fleet/vehicles/stats?types=gps&vehicleIds=${v}&decorations=currentDriver`,
  };
  for (const [k, url] of Object.entries(tries)) {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    const t = await r.text();
    out[k] = { status: r.status, body: t.slice(0, 1500) };
  }
  return NextResponse.json(out);
}
