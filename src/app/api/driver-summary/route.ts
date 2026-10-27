import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

// One row per driver for the chosen period, plus the same figures for the
// period of equal length immediately before it (so the page can show week on
// week or month on month change). Revenue is the CAA "Total cost" of the
// driver's calls. Pay is worked out from the driver's pay setup, when one exists.
const DAY_MS = 86_400_000;
const parse = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
const fmt = (ms: number) => new Date(ms).toISOString().slice(0, 10);

type Stats = {
  driver_id: string;
  calls: number;
  km: number;
  revenue: number;
  active_days: number;
  zero_calls: number;
  hours: number;
};

async function statsFor(from: string | null, to: string | null): Promise<Map<string, Stats>> {
  const where = from && to ? "AND receive_date >= $1 AND receive_date <= $2" : "";
  const rows = await query<any>(
    `SELECT driver_id::text AS driver_id,
            COUNT(*) AS calls,
            COALESCE(SUM(towed_kms_paid), 0) AS km,
            COALESCE(SUM(total_cost), 0) AS revenue,
            COUNT(DISTINCT receive_date) AS active_days,
            COUNT(*) FILTER (WHERE total_cost = 0) AS zero_calls,
            COALESCE(SUM(EXTRACT(EPOCH FROM (cl_dt - re_dt)) / 3600.0) FILTER (WHERE cl_dt > re_dt), 0) AS hours
     FROM tow_calls
     WHERE driver_id IS NOT NULL ${where}
     GROUP BY driver_id`,
    from && to ? [from, to] : []
  );
  return new Map(
    rows.map((r) => [
      r.driver_id,
      {
        driver_id: r.driver_id,
        calls: Number(r.calls),
        km: Number(r.km),
        revenue: Number(r.revenue),
        active_days: Number(r.active_days),
        zero_calls: Number(r.zero_calls),
        hours: Number(r.hours),
      },
    ])
  );
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const hasRange = Boolean(from && to && /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to));

  try {
    const cur = await statsFor(hasRange ? from : null, hasRange ? to : null);

    let prev = new Map<string, Stats>();
    let prevRange: { from: string; to: string } | null = null;
    let days: number | null = null;
    if (hasRange) {
      const f = parse(from!);
      const t = parse(to!);
      days = Math.max(1, Math.round((t - f) / DAY_MS) + 1);
      prevRange = { from: fmt(f - days * DAY_MS), to: fmt(f - DAY_MS) };
      prev = await statsFor(prevRange.from, prevRange.to);
    }

    const masters = await query<any>(
      `SELECT driver_id, driver_name, status, compensation_type, hourly_rate, monthly_salary FROM driver_master`
    );
    const master = new Map(masters.map((m) => [String(m.driver_id), m]));

    const ids = new Set([...cur.keys()]);
    const drivers = [...ids].map((id) => {
      const c = cur.get(id)!;
      const p = prev.get(id);
      const m = master.get(id);
      let pay: number | null = null;
      if (m?.compensation_type === "salary" && m.monthly_salary && days) {
        pay = (Number(m.monthly_salary) * days) / (365 / 12);
      } else if (m?.compensation_type === "hourly" && m.hourly_rate) {
        pay = c.hours * Number(m.hourly_rate);
      }
      return {
        driverId: id,
        name: m?.driver_name ?? null,
        calls: c.calls,
        km: c.km,
        revenue: c.revenue,
        activeDays: c.active_days,
        zeroCalls: c.zero_calls,
        pay: pay === null ? null : Math.round(pay * 100) / 100,
        prev: p ? { calls: p.calls, km: p.km, revenue: p.revenue, activeDays: p.active_days } : null,
      };
    });

    // Drivers who worked in the previous period but not this one still matter
    // for week-on-week, so they are listed with zeros.
    for (const [id, p] of prev) {
      if (cur.has(id)) continue;
      const m = master.get(id);
      drivers.push({
        driverId: id,
        name: m?.driver_name ?? null,
        calls: 0,
        km: 0,
        revenue: 0,
        activeDays: 0,
        zeroCalls: 0,
        pay: null,
        prev: { calls: p.calls, km: p.km, revenue: p.revenue, activeDays: p.active_days },
      });
    }

    drivers.sort((a, b) => b.revenue - a.revenue);
    return NextResponse.json({
      range: hasRange ? { from, to, days } : null,
      previousRange: prevRange,
      drivers,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
