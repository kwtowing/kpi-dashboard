import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
// Temporary diagnostic: how many vehicles the token sees, and how stats paging behaves.
export async function GET() {
  const token = process.env.SAMSARA_API_TOKEN;
  if (!token) return NextResponse.json({ error: "no token" });
  const H = { Authorization: `Bearer ${token}` };
  const out: any = {};
  // all vehicles, paged
  const names: string[] = [];
  let after = "";
  for (let i = 0; i < 20; i++) {
    const r = await fetch(`https://api.samsara.com/fleet/vehicles?limit=512${after ? `&after=${after}` : ""}`, { headers: H, cache: "no-store" });
    const j = await r.json();
    for (const v of j.data ?? []) names.push(`${v.name}|${v.id}`);
    if (!j.pagination?.hasNextPage) break;
    after = j.pagination.endCursor;
  }
  out.vehicleCount = names.length;
  out.vehicles = names;
  // stats, paged, aux inputs
  const types = Array.from({ length: 13 }, (_, i) => `auxInput${i + 1}`).join(",");
  const seen: string[] = [];
  after = "";
  const pages: any[] = [];
  for (let i = 0; i < 20; i++) {
    const r = await fetch(`https://api.samsara.com/fleet/vehicles/stats?types=${types}${after ? `&after=${after}` : ""}`, { headers: H, cache: "no-store" });
    const j = await r.json();
    pages.push({ n: (j.data ?? []).length, hasNext: j.pagination?.hasNextPage });
    for (const v of j.data ?? []) seen.push(v.name);
    if (!j.pagination?.hasNextPage) break;
    after = j.pagination.endCursor;
  }
  out.statsPages = pages;
  out.statsVehicles = seen;
  return NextResponse.json(out);
}
