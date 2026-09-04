import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { ALERT_TYPES } from "@/lib/alerts/thresholds";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rules = await query(`SELECT * FROM notification_rules ORDER BY alert_type`);
    return NextResponse.json({ rules });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// Body: { alert_type, recipient_emails: string[], throttle_minutes, is_active }
export async function POST(req: NextRequest) {
  try {
    const b = await req.json();
    if (!ALERT_TYPES.includes(b.alert_type)) {
      return NextResponse.json({ error: "Invalid alert_type" }, { status: 400 });
    }
    // Stunt driving is never throttled — every occurrence notifies (spec section 4).
    const throttleMinutes = b.alert_type === "stunt_driving" ? 0 : Number(b.throttle_minutes) || 0;
    const rows = await query(
      `INSERT INTO notification_rules (alert_type, recipient_emails, throttle_minutes, is_active)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (alert_type) DO UPDATE SET
         recipient_emails = EXCLUDED.recipient_emails,
         throttle_minutes = EXCLUDED.throttle_minutes,
         is_active = EXCLUDED.is_active,
         updated_at = now()
       RETURNING *`,
      [b.alert_type, b.recipient_emails ?? [], throttleMinutes, b.is_active ?? false]
    );
    return NextResponse.json({ ok: true, rule: rows[0] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
