// PTO (power take-off) and boom usage from Samsara auxiliary inputs.
// Each truck wires PTO/boom to a different input number, so inputs are
// recognised by the NAME Samsara gives them ("Power Take-Off", "(ECU) Power Take-Off", "Boom").

const BASE = "https://api.samsara.com";
const AUX_TYPES = Array.from({ length: 13 }, (_, i) => `auxInput${i + 1}`).join(",");

export type Interval = { start: number; end: number };
export type VehiclePto = { vehicleId: string; name: string; pto: Interval[]; boom: Interval[]; hasPto: boolean; hasBoom: boolean };

function headers() {
  const token = process.env.SAMSARA_API_TOKEN;
  if (!token) throw new Error("SAMSARA_API_TOKEN is not set");
  return { Authorization: `Bearer ${token}` };
}

type Sample = { time: number; on: boolean };

function toIntervals(samples: Sample[], rangeEnd: number): Interval[] {
  const s = [...samples].sort((a, b) => a.time - b.time);
  const out: Interval[] = [];
  let open: number | null = null;
  for (const x of s) {
    if (x.on && open === null) open = x.time;
    else if (!x.on && open !== null) {
      out.push({ start: open, end: x.time });
      open = null;
    }
  }
  if (open !== null) out.push({ start: open, end: Math.max(open, rangeEnd) });
  return out;
}

export async function getPtoHistory(startMs: number, endMs: number): Promise<VehiclePto[]> {
  const now = Date.now();
  const rangeEnd = Math.min(endMs, now);
  const samples = new Map<string, { name: string; pto: Sample[]; boom: Sample[]; hasPto: boolean; hasBoom: boolean }>();
  const CHUNK = 7 * 86_400_000;
  for (let from = startMs; from < rangeEnd; from += CHUNK) {
    const to = Math.min(from + CHUNK, rangeEnd);
    let after: string | undefined;
    for (let page = 0; page < 40; page++) {
      const params = new URLSearchParams({
        types: AUX_TYPES,
        startTime: new Date(from).toISOString(),
        endTime: new Date(to).toISOString(),
      });
      if (after) params.set("after", after);
      const res = await fetch(`${BASE}/fleet/vehicles/stats/history?${params.toString()}`, { headers: headers(), cache: "no-store" });
      if (!res.ok) throw new Error(`Samsara API error ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const json = await res.json();
      for (const v of json.data ?? []) {
        const id = String(v.id);
        const rec: { name: string; pto: Sample[]; boom: Sample[]; hasPto: boolean; hasBoom: boolean } =
          samples.get(id) ?? { name: v.name ?? id, pto: [], boom: [], hasPto: false, hasBoom: false };
        for (const key of Object.keys(v)) {
          if (!key.startsWith("auxInput") || !Array.isArray(v[key])) continue;
          for (const p of v[key]) {
            const label = String(p.name ?? "").toLowerCase();
            const kind = label.includes("power take") || label.includes("pto") ? "pto" : label.includes("boom") ? "boom" : null;
            if (!kind) continue;
            const sample = { time: new Date(p.time).getTime(), on: p.value === true || p.value === "true" };
            if (kind === "pto") {
              rec.hasPto = true;
              rec.pto.push(sample);
            } else {
              rec.hasBoom = true;
              rec.boom.push(sample);
            }
          }
        }
        samples.set(id, rec);
      }
      if (!json.pagination?.hasNextPage || !json.pagination?.endCursor) break;
      after = json.pagination.endCursor;
    }
  }
  // Samples are merged across chunks, so a PTO that stays on across a chunk edge stays one interval.
  return [...samples.entries()].map(([vehicleId, r]) => ({
    vehicleId,
    name: r.name,
    hasPto: r.hasPto,
    hasBoom: r.hasBoom,
    pto: toIntervals(r.pto, rangeEnd),
    boom: toIntervals(r.boom, rangeEnd),
  }));
}
