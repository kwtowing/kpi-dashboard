import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const alertType = searchParams.get("alert_type");
  const truckNumber = searchParams.get("truck_number");
  const driverId = searchParams.get("driver_id");
  const status = searchParams.get("status");

  const conditions: string[] = [];
  const params: any[] = [];

  if (from) {
    params.push(`${from}T00:00:00Z`);
    conditions.push(`a.opened_at >= $${params.length}`);
  }
  if (to) {
    params.push(`${to}T23:59:59Z`);
    conditions.push(`a.opened_at <= $${params.length}`);
  }
  if (alertType) {
    params.push(alertType);
    conditions.push(`a.alert_type = $${params.length}`);
  }
  if (truckNumber) {
    params.push(truckNumber);
    conditions.push(`a.truck_number = $${params.length}`);
  }
  if (driverId) {
    params.push(driverId);
    conditions.push(`a.driver_id = $${params.length}`);
  }
  if (status) {
    params.push(status);
    conditions.push(`a.status = $${params.length}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  try {
    const rows = await query(
      `SELECT a.*, d.driver_name
       FROM alert_history a
       LEFT JOIN driver_master d ON d.driver_id = a.driver_id
       ${where}
       ORDER BY a.opened_at DESC
       LIMIT 1000`,
      params
    );

    const summary = await query<{ alert_type: string; status: string; count: string }>(
      `SELECT alert_type, status, COUNT(*) as count FROM alert_history GROUP BY alert_type, status`
    );

    const [today] = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM alert_history WHERE opened_at >= date_trunc('day', now())`
    );
    const [sevenDay] = await query<{ avg: string }>(
      `SELECT COUNT(*) / 7.0 as avg FROM alert_history WHERE opened_at >= now() - interval '7 days'`
    );
    const [stunt] = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM alert_history WHERE alert_type = 'stunt_driving' AND status = 'open'`
    );

    return NextResponse.json({
      alerts: rows,
      summary: {
        byTypeAndStatus: summary,
        today: Number(today?.count ?? 0),
        sevenDayAverage: Number(sevenDay?.avg ?? 0),
        openStuntDriving: Number(stunt?.count ?? 0),
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// Body: { id, action: 'acknowledge' | 'dismiss' | 'note', acknowledged_by?, notes? }
export async function PATCH(req: NextRequest) {
  try {
    const b = await req.json();
    if (!b.id || !b.action) {
      return NextResponse.json({ error: "id and action are required" }, { status: 400 });
    }

    let rows;
    if (b.action === "acknowledge") {
      rows = await query(
        `UPDATE alert_history SET status = 'acknowledged', acknowledged_by = $2, acknowledged_at = now() WHERE id = $1 RETURNING *`,
        [b.id, b.acknowledged_by ?? null]
      );
    } else if (b.action === "dismiss") {
      rows = await query(
        `UPDATE alert_history SET status = 'dismissed', resolved_at = now() WHERE id = $1 RETURNING *`,
        [b.id]
      );
    } else if (b.action === "note") {
      rows = await query(`UPDATE alert_history SET notes = $2 WHERE id = $1 RETURNING *`, [b.id, b.notes ?? null]);
    } else {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    return NextResponse.json({ ok: true, alert: rows[0] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
