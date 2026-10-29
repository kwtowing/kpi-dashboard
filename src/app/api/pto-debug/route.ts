import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
// Temporary diagnostic: other Samsara endpoints that might expose ECU PTO for KW 32.
export async function GET() {
  const token = process.env.SAMSARA_API_TOKEN;
  if (!token) return NextResponse.json({ error: "no token" });
  const H = { Authorization: `Bearer ${token}` };
  const id = "281474993726477";
  const end = new Date(), start = new Date(end.getTime() - 6 * 3600000);
  const s = start.toISOString(), e = end.toISOString();
  const urls: Record<string, string> = {
    assetInputsStream: `https://api.samsara.com/assets/inputs/stream?startTime=${s}&endTime=${e}&ids=${id}`,
    assetInputsStreamNoIds: `https://api.samsara.com/assets/inputs/stream?startTime=${s}&endTime=${e}`,
    assetsList: `https://api.samsara.com/assets?limit=5`,
    vehicleStatsFeed: `https://api.samsara.com/fleet/vehicles/stats/feed?types=auxInput1,auxInput2,auxInput3,auxInput4&vehicleIds=${id}`,
    vehicleDetail: `https://api.samsara.com/fleet/vehicles/${id}`,
  };
  const out: Record<string, any> = {};
  for (const [k, u] of Object.entries(urls)) {
    const r = await fetch(u, { headers: H, cache: "no-store" });
    out[k] = { status: r.status, body: (await r.text()).slice(0, 1200) };
  }
  return NextResponse.json(out);
}
