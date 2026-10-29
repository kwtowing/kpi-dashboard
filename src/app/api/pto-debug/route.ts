import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
// Temporary diagnostic: slow, sequential check of KW 32 / KW 17 / KW 34 aux readings.
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export async function GET() {
  const token = process.env.SAMSARA_API_TOKEN;
  if (!token) return NextResponse.json({ error: "no token" });
  const H = { Authorization: `Bearer ${token}` };
  const trucks: Record<string, string> = { "KW 32": "281474993726477", "KW 17": "281474996462083", "KW 34": "281474995394619" };
  const end = new Date(), start = new Date(end.getTime() - 2 * 86400000);
  const out: Record<string, any> = {};
  for (const [name, id] of Object.entries(trucks)) {
    out[name] = {};
    for (let n = 1; n <= 5; n++) {
      let r = await fetch(`https://api.samsara.com/assets/inputs/stream?startTime=${start.toISOString()}&endTime=${end.toISOString()}&ids=${id}&type=auxInput${n}`, { headers: H, cache: "no-store" });
      if (r.status === 429) { await sleep(3000); r = await fetch(`https://api.samsara.com/assets/inputs/stream?startTime=${start.toISOString()}&endTime=${end.toISOString()}&ids=${id}&type=auxInput${n}`, { headers: H, cache: "no-store" }); }
      if (r.status !== 200) { out[name][`aux${n}`] = `HTTP ${r.status}`; continue; }
      const d: any[] = (await r.json()).data ?? [];
      const on = d.filter((x) => x.value === "true");
      out[name][`aux${n}`] = `${on.length} true / ${d.length}` + (on.length ? ` e.g. ${on.slice(0, 3).map((x) => x.happenedAtTime).join(", ")}` : "");
      await sleep(400);
    }
  }
  return NextResponse.json(out);
}
