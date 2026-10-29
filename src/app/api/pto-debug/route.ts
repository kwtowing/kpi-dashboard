import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
// Temporary diagnostic: count "true" aux readings per vehicle over 3 days via the Assets feed.
export async function GET() {
  const token = process.env.SAMSARA_API_TOKEN;
  if (!token) return NextResponse.json({ error: "no token" });
  const H = { Authorization: `Bearer ${token}` };
  const vres = await fetch("https://api.samsara.com/fleet/vehicles?limit=512", { headers: H, cache: "no-store" });
  const vehicles: { id: string; name: string }[] = (await vres.json()).data ?? [];
  const end = new Date(), start = new Date(end.getTime() - 3 * 86400000);
  const jobs: (() => Promise<void>)[] = [];
  const out: Record<string, Record<string, string>> = {};
  for (const v of vehicles) {
    out[v.name] = {};
    for (let n = 1; n <= 6; n++) {
      jobs.push(async () => {
        const u = `https://api.samsara.com/assets/inputs/stream?startTime=${start.toISOString()}&endTime=${end.toISOString()}&ids=${v.id}&type=auxInput${n}`;
        const r = await fetch(u, { headers: H, cache: "no-store" });
        if (r.status !== 200) { out[v.name][`aux${n}`] = `HTTP ${r.status}`; return; }
        const d: any[] = (await r.json()).data ?? [];
        const t = d.filter((x) => x.value === "true" || x.value === true).length;
        if (d.length) out[v.name][`aux${n}`] = `${t} true / ${d.length}`;
      });
    }
  }
  const queue = [...jobs];
  await Promise.all(Array.from({ length: 16 }, async () => { while (queue.length) await queue.shift()!(); }));
  return NextResponse.json(out);
}
