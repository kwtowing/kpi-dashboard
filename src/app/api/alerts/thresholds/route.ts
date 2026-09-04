import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { ALERT_TYPES } from "@/lib/alerts/thresholds";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const defaults = await query(`SELECT * FROM alert_threshold_defaults ORDER BY alert_type`);
    const overrides = await query(
      `SELECT o.*, d.driver_name
       FROM alert_threshold_overrides o
       LEFT JOIN driver_master d ON d.driver_id = o.driver_id
       ORDER BY o.effective_from DESC`
    );
    return NextResponse.json({ defaults, overrides });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// Body: { kind: 'default', alert_type, threshold_value, unit, grace_seconds, is_active }
//     | { kind: 'override', scope, truck_number?, driver_id?, alert_type, threshold_value, unit, is_active, effective_from?, effective_to? }
export async function POST(req: NextRequest) {
  try {
    const b = await req.json();

    if (!ALERT_TYPES.includes(b.alert_type)) {
      return NextResponse.json({ error: "Invalid alert_type" }, { status: 400 });
    }

    if (b.kind === "default") {
      const rows = await query(
        `UPDATE alert_threshold_defaults
         SET threshold_value = $2, unit = $3, grace_seconds = $4, is_active = $5, updated_at = now(), updated_by = $6
         WHERE alert_type = $1
         RETURNING *`,
        [b.alert_type, b.threshold_value ?? null, b.unit ?? null, b.grace_seconds ?? 0, b.is_active ?? true, b.updated_by ?? null]
      );
      return NextResponse.json({ ok: true, default: rows[0] });
    }

    if (b.kind === "override") {
      if (b.scope !== "truck" && b.scope !== "driver") {
        return NextResponse.json({ error: "scope must be 'truck' or 'driver'" }, { status: 400 });
      }
      if (b.scope === "truck" && !b.truck_number) {
        return NextResponse.json({ error: "truck_number is required for a truck override" }, { status: 400 });
      }
      if (b.scope === "driver" && !b.driver_id) {
        return NextResponse.json({ error: "driver_id is required for a driver override" }, { status: 400 });
      }
      const rows = await query(
        `INSERT INTO alert_threshold_overrides
           (scope, truck_number, driver_id, alert_type, threshold_value, unit, is_active, effective_from, effective_to, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, now()), $9, $10)
         RETURNING *`,
        [
          b.scope,
          b.scope === "truck" ? b.truck_number : null,
          b.scope === "driver" ? b.driver_id : null,
          b.alert_type,
          b.threshold_value ?? null,
          b.unit ?? null,
          b.is_active ?? true,
          b.effective_from ?? null,
          b.effective_to ?? null,
          b.updated_by ?? null,
        ]
      );
      return NextResponse.json({ ok: true, override: rows[0] });
    }

    return NextResponse.json({ error: "kind must be 'default' or 'override'" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// Removes an override — pass ?id=<override id>.
export async function DELETE(req: NextRequest) {
  try {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
    await query(`DELETE FROM alert_threshold_overrides WHERE id = $1`, [id]);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
