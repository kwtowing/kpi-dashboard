import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
// Temporary diagnostic: why do some PTO trucks not appear in aux-input stats?
export async function GET() {
  const token = process.env.SAMSARA_API_TOKEN;
  if (!token) return NextResponse.json({ error: "no token" });
  const H = { Authorization: `Bearer ${token}` };
  const ids = "281474993726477,281474995394619,281474996462083"; // KW 32, KW 34, KW 17
  const aux = Array.from({ length: 13 }, (_, i) => `auxInput${i + 1}`).join(",");
  const end = new Date(), start = new Date(end.getTime() - 86400000);
  const get = async (u: string) => {
    const r = await fetch(u, { headers: H, cache: "no-store" });
    return { status: r.status, body: (await r.text()).slice(0, 1800) };
  };
  return NextResponse.json({
    badType: await get(`https://api.samsara.com/fleet/vehicles/stats?types=bogusType`),
    currentForThree: await get(`https://api.samsara.com/fleet/vehicles/stats?types=${aux}&vehicleIds=${ids}`),
    historyForThree: await get(`https://api.samsara.com/fleet/vehicles/stats/history?types=${aux}&vehicleIds=${ids}&startTime=${start.toISOString()}&endTime=${end.toISOString()}`),
  });
}
