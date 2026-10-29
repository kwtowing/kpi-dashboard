import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
// Temporary diagnostic: which stat type names does Samsara accept, and what do they return for KW 32?
export async function GET() {
  const token = process.env.SAMSARA_API_TOKEN;
  if (!token) return NextResponse.json({ error: "no token" });
  const H = { Authorization: `Bearer ${token}` };
  const id = "281474993726477"; // KW 32 (PTO on right now in Samsara)
  const cands = ["pto", "ptoState", "ptoActive", "ptoEngaged", "powerTakeOff", "powerTakeOffState", "ecuPto", "ptoStates", "engineStates", "engineLoadPercent", "engineRpm", "auxInput", "auxInputSeries", "ptoSeconds", "engineSeconds", "derivedPto", "dashboardPto"];
  const out: Record<string, any> = {};
  for (const c of cands) {
    const r = await fetch(`https://api.samsara.com/fleet/vehicles/stats?types=${c}&vehicleIds=${id}`, { headers: H, cache: "no-store" });
    const t = await r.text();
    out[c] = { status: r.status, body: t.slice(0, 400) };
  }
  return NextResponse.json(out);
}
