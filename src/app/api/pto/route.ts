import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getPtoHistory, Interval } from "@/lib/connectors/samsaraPto";
import { listVehicleDriverStretches } from "@/lib/connectors/samsara";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TZ = "America/Toronto";

function tzOffsetMs(utcMs: number): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(utcMs));
  const g = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  return Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second")) - Math.floor(utcMs / 1000) * 1000;
}
// Start of a Toronto calendar day, as UTC milliseconds.
function torontoDayStart(day: string): number {
  const guess = Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10));
  let ms = guess - tzOffsetMs(guess);
  ms = guess - tzOffsetMs(ms);
  return ms;
}
const dayKey = (ms: number) => new Date(ms + tzOffsetMs(ms)).toISOString().slice(0, 10);
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

const overlap = (a: Interval, b: Interval) => Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));
const sum = (iv: Interval[]) => iv.reduce((t, x) => t + (x.end - x.start), 0);

// Split an interval at Toronto midnights so each day gets its own share.
function splitByDay(iv: Interval): { day: string; ms: number }[] {
  const out: { day: string; ms: number }[] = [];
  let cur = iv.start;
  while (cur < iv.end) {
    const d = dayKey(cur);
    const nextDay = new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) + 86_400_000).toISOString().slice(0, 10);
    const edge = Math.min(iv.end, torontoDayStart(nextDay));
    out.push({ day: d, ms: edge - cur });
    cur = edge;
  }
  return out;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  if (!from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return NextResponse.json({ error: "from and to (YYYY-MM-DD) are required" }, { status: 400 });
  }
  const startMs = torontoDayStart(from);
  const endMs = torontoDayStart(new Date(Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10)) + 86_400_000).toISOString().slice(0, 10));
  if (endMs - startMs > 32 * 86_400_000) return NextResponse.json({ error: "Please choose 31 days or fewer." }, { status: 400 });

  try {
    const vehicles = await getPtoHistory(startMs, endMs);

    // Link Samsara vehicles to CAA truck codes (for matching PTO to calls).
    const masters = await query<any>(`SELECT truck_number, samsara_vehicle_id, samsara_name FROM truck_master`);
    const truckFor = (v: { vehicleId: string; name: string }): string | null => {
      for (const m of masters) {
        if (m.samsara_vehicle_id && String(m.samsara_vehicle_id) === v.vehicleId) return m.truck_number;
        if (m.samsara_name && norm(m.samsara_name) === norm(v.name)) return m.truck_number;
      }
      for (const m of masters) if (norm(m.truck_number) === norm(v.name)) return m.truck_number;
      return null;
    };

    // Call windows per truck (padded 15 min either side).
    const calls = await query<any>(
      `SELECT truck,
              EXTRACT(EPOCH FROM COALESCE(sp_dt, as_dt, re_dt)) * 1000 AS s,
              EXTRACT(EPOCH FROM COALESCE(cl_dt, hs_dt, tw_dt, ol_dt)) * 1000 AS e
       FROM tow_calls
       WHERE truck IS NOT NULL AND COALESCE(sp_dt, as_dt, re_dt) IS NOT NULL
         AND COALESCE(sp_dt, as_dt, re_dt) < to_timestamp($2 / 1000.0)
         AND COALESCE(cl_dt, hs_dt, tw_dt, ol_dt, COALESCE(sp_dt, as_dt, re_dt)) > to_timestamp($1 / 1000.0)`,
      [startMs - 86_400_000, endMs]
    );
    const callWindows = new Map<string, Interval[]>();
    for (const c of calls) {
      const s = Number(c.s), e = c.e === null ? s : Number(c.e);
      const list = callWindows.get(c.truck) ?? [];
      list.push({ start: s - 15 * 60_000, end: Math.max(s, e) + 15 * 60_000 });
      callWindows.set(c.truck, list);
    }

    const active = vehicles.filter((v) => v.pto.length || v.boom.length || v.hasPto || v.hasBoom);
    let stretches = new Map<string, { driverId: string; driverName: string | null; start: number; end: number }[]>();
    try {
      stretches = await listVehicleDriverStretches(active.map((v) => v.vehicleId), new Date(startMs).toISOString(), new Date(Math.min(endMs, Date.now())).toISOString());
    } catch {}

    const byDriver = new Map<string, { driverId: string; name: string; ptoMs: number; boomMs: number; noCallMs: number }>();
    const byDay = new Map<string, number>();
    const trucks = active.map((v) => {
      const truckCode = truckFor(v);
      const windows = truckCode ? callWindows.get(truckCode) ?? [] : null;
      const clip = (iv: Interval): Interval => ({ start: Math.max(iv.start, startMs), end: Math.min(iv.end, endMs) });
      const pto = v.pto.map(clip).filter((i) => i.end > i.start);
      const boom = v.boom.map(clip).filter((i) => i.end > i.start);
      let noCallMs: number | null = null;
      if (windows) {
        noCallMs = 0;
        for (const iv of pto) {
          const covered = windows.reduce((t, w) => t + overlap(iv, w), 0);
          noCallMs += Math.max(0, iv.end - iv.start - Math.min(covered, iv.end - iv.start));
        }
      }
      const days: Record<string, number> = {};
      for (const iv of pto) for (const part of splitByDay(iv)) {
        days[part.day] = (days[part.day] ?? 0) + part.ms;
        byDay.set(part.day, (byDay.get(part.day) ?? 0) + part.ms);
      }
      // Attribute to drivers by who was signed in.
      const st = stretches.get(v.vehicleId) ?? [];
      const add = (iv: Interval, key: "ptoMs" | "boomMs") => {
        let used = 0;
        for (const s of st) {
          const ms = overlap(iv, { start: s.start, end: s.end });
          if (!ms) continue;
          used += ms;
          const r = byDriver.get(s.driverId) ?? { driverId: s.driverId, name: s.driverName ?? s.driverId, ptoMs: 0, boomMs: 0, noCallMs: 0 };
          r[key] += ms;
          byDriver.set(s.driverId, r);
        }
        const rest = iv.end - iv.start - used;
        if (rest > 1000) {
          const r = byDriver.get("unknown") ?? { driverId: "unknown", name: "No driver signed in", ptoMs: 0, boomMs: 0, noCallMs: 0 };
          r[key] += rest;
          byDriver.set("unknown", r);
        }
      };
      pto.forEach((iv) => add(iv, "ptoMs"));
      boom.forEach((iv) => add(iv, "boomMs"));
      return {
        vehicleId: v.vehicleId,
        name: v.name,
        truckCode,
        tracksPto: v.hasPto,
        tracksBoom: v.hasBoom,
        ptoHours: sum(pto) / 3_600_000,
        boomHours: sum(boom) / 3_600_000,
        sessions: pto.length,
        longestPtoMin: pto.length ? Math.max(...pto.map((i) => i.end - i.start)) / 60_000 : 0,
        noCallHours: noCallMs === null ? null : noCallMs / 3_600_000,
        callMatching: windows !== null,
        days,
      };
    });
    trucks.sort((a, b) => b.ptoHours + b.boomHours - (a.ptoHours + a.boomHours));

    return NextResponse.json({
      range: { from, to },
      trucks,
      drivers: [...byDriver.values()].map((d) => ({ driverId: d.driverId, name: d.name, ptoHours: d.ptoMs / 3_600_000, boomHours: d.boomMs / 3_600_000 })).sort((a, b) => b.ptoHours - a.ptoHours),
      days: [...byDay.entries()].sort().map(([day, ms]) => ({ day, ptoHours: ms / 3_600_000 })),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
