import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
// Temporary diagnostic: Assets API after permission change.
export async function GET() {
  const token = process.env.SAMSARA_API_TOKEN;
  if (!token) return NextResponse.json({ error: "no token" });
  const H = { Authorization: `Bearer ${token}` };
  const id = "281474993726477";
  const end = new Date(), start = new Date(end.getTime() - 6 * 3600000);
  const s = start.toISOString(), e = end.toISOString();
  const urls: Record<string, string> = {
    assetsList: `https://api.samsara.com/assets?limit=3`,
    inputsStream: `https://api.samsara.com/assets/inputs/stream?startTime=${s}&endTime=${e}&ids=${id}`,
    inputsStreamPto: `https://api.samsara.com/assets/inputs/stream?startTime=${s}&endTime=${e}&ids=${id}&inputs=powerTakeOff`,
    inputsStreamAll: `https://api.samsara.com/assets/inputs/stream?startTime=${s}&endTime=${e}`,
  };
  const out: Record<string, any> = {};
  for (const [k, u] of Object.entries(urls)) {
    const r = await fetch(u, { headers: H, cache: "no-store" });
    out[k] = { status: r.status, body: (await r.text()).slice(0, 1500) };
  }
  return NextResponse.json(out);
}
