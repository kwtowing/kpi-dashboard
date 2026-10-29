import { NextRequest, NextResponse } from "next/server";
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

    const active = vehicles.filter((v) => v.pto.length || v.boom.length || v.hasPto || v.hasBoom);
    let stretches = new Map<string, { driverId: string; driverName: string | null; start: number; end: number }[]>();
    try {
      stretches = await listVehicleDriverStretches(active.map((v) => v.vehicleId), new Date(startMs).toISOString(), new Date(Math.min(endMs, Date.now())).toISOString());
    } catch {}

    const byDriver = new Map<string, { driverId: string; name: string; ptoMs: number; boomMs: number; noCallMs: number }>();
    const byDay = new Map<string, number>();
    const trucks = active.map((v) => {
      const clip = (iv: Interval): Interval => ({ start: Math.max(iv.start, startMs), end: Math.min(iv.end, endMs) });
      const pto = v.pto.map(clip).filter((i) => i.end > i.start);
      const boom = v.boom.map(clip).filter((i) => i.end > i.start);
      // Per Toronto day: how many times switched on (counted on the day it started) and total time on.
      type Day = { ptoCount: number; ptoMs: number; boomCount: number; boomMs: number };
      const days: Record<string, Day> = {};
      const dayOf = (d: string) => (days[d] ??= { ptoCount: 0, ptoMs: 0, boomCount: 0, boomMs: 0 });
      for (const iv of pto) {
        dayOf(dayKey(iv.start)).ptoCount++;
        for (const part of splitByDay(iv)) {
          dayOf(part.day).ptoMs += part.ms;
          byDay.set(part.day, (byDay.get(part.day) ?? 0) + part.ms);
        }
      }
      for (const iv of boom) {
        dayOf(dayKey(iv.start)).boomCount++;
        for (const part of splitByDay(iv)) dayOf(part.day).boomMs += part.ms;
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
        tracksPto: v.hasPto,
        tracksBoom: v.hasBoom,
        ptoHours: sum(pto) / 3_600_000,
        boomHours: sum(boom) / 3_600_000,
        sessions: pto.length,
        boomSessions: boom.length,
        longestPtoMin: pto.length ? Math.max(...pto.map((i) => i.end - i.start)) / 60_000 : 0,
        days,
        ptoSessions: pto.map((i) => [i.start, i.end]),
        boomSessionList: boom.map((i) => [i.start, i.end]),
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
