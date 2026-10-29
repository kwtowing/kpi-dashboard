import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
// Temporary diagnostic: Assets inputs stream per aux input for KW 32 and KW 17.
export async function GET() {
  const token = process.env.SAMSARA_API_TOKEN;
  if (!token) return NextResponse.json({ error: "no token" });
  const H = { Authorization: `Bearer ${token}` };
  const ids = ["281474993726477", "281474996462083"];
  const end = new Date(), start = new Date(end.getTime() - 24 * 3600000);
  const out: Record<string, any> = {};
  for (const id of ids) {
    for (let n = 1; n <= 13; n++) {
      const u = `https://api.samsara.com/assets/inputs/stream?startTime=${start.toISOString()}&endTime=${end.toISOString()}&ids=${id}&type=auxInput${n}`;
      const r = await fetch(u, { headers: H, cache: "no-store" });
      const t = await r.text();
      if (r.status !== 200 || t.length > 120) out[`${id}/aux${n}`] = { status: r.status, body: t.slice(0, 500) };
    }
  }
  out.done = true;
  return NextResponse.json(out);
}
