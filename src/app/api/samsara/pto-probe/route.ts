import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Read-only check: which trucks report auxiliary-input (PTO switch) data to Samsara?
export async function GET() {
  const token = process.env.SAMSARA_API_TOKEN;
  if (!token) return NextResponse.json({ ok: false, reason: "SAMSARA_API_TOKEN not set" });
  const types = Array.from({ length: 13 }, (_, i) => `auxInput${i + 1}`).join(",");
  const res = await fetch(`https://api.samsara.com/fleet/vehicles/stats?types=${types}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: false, status: res.status, body: text.slice(0, 600) });
  const json = JSON.parse(text);
  const vehicles = (json.data ?? []).map((v: any) => {
    const inputs: Record<string, any> = {};
    for (const k of Object.keys(v)) if (k.startsWith("auxInput")) inputs[k] = v[k];
    return { id: v.id, name: v.name, inputs };
  });
  return NextResponse.json({ ok: true, total: vehicles.length, withAux: vehicles.filter((v: any) => Object.keys(v.inputs).length).length, vehicles });
}
