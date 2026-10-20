import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

// KMs (CAA "Total Towed KMs Paid") per driver for the latest week that has
// data, alongside the three weeks before it. The latest week is taken from the
// data itself, so the view still makes sense if the most recent CAA import is
// a little behind the calendar. Weeks run Monday-Sunday.
export async function GET() {
  try {
    const rows = await query(
      `WITH anchor AS (
         SELECT date_trunc('week', MAX(receive_date))::date AS wk FROM tow_calls
       )
       SELECT tc.driver_id::text AS driver_id,
              dm.driver_name,
              ((a.wk - date_trunc('week', tc.receive_date)::date) / 7) AS weeks_ago,
              COALESCE(SUM(tc.towed_kms_paid), 0) AS km_paid,
              COUNT(*) AS calls,
              to_char(a.wk, 'YYYY-MM-DD') AS latest_week_start
       FROM tow_calls tc
       CROSS JOIN anchor a
       LEFT JOIN driver_master dm ON dm.driver_id = tc.driver_id
       WHERE tc.driver_id IS NOT NULL
         AND tc.receive_date >= a.wk - 21
         AND tc.receive_date <= a.wk + 6
       GROUP BY tc.driver_id, dm.driver_name, a.wk, weeks_ago`
    );

    const latestWeekStart: string | null = rows.length ? rows[0].latest_week_start : null;

    // One row per driver, with km for weeks 0 (latest) to 3 (three weeks earlier).
    const byDriver = new Map<string, { driverId: string; name: string | null; km: number[]; calls: number[] }>();
    for (const r of rows) {
      const i = Number(r.weeks_ago);
      if (i < 0 || i > 3) continue;
      let d = byDriver.get(r.driver_id);
      if (!d) {
        d = { driverId: r.driver_id, name: r.driver_name || null, km: [0, 0, 0, 0], calls: [0, 0, 0, 0] };
        byDriver.set(r.driver_id, d);
      }
      d.km[i] = Number(r.km_paid);
      d.calls[i] = Number(r.calls);
    }

    return NextResponse.json({ latestWeekStart, drivers: [...byDriver.values()] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
