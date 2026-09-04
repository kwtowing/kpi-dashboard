import { query } from "@/lib/db";
import { sendEmail, EmailNotConfigured } from "@/lib/email";
import type { AlertType, ThresholdSource } from "./thresholds";

export const ALERT_TYPE_LABELS: Record<AlertType, string> = {
  speeding: "Speeding",
  stunt_driving: "Stunt driving (HTA s.172)",
  excessive_idle: "Excessive idling",
  harsh_braking: "Harsh braking",
  harsh_acceleration: "Harsh acceleration",
  harsh_cornering: "Harsh cornering",
};

const SOURCE_LABELS: Record<ThresholdSource, string> = {
  driver: "driver override",
  truck: "truck override",
  global: "global default",
  legal: "legal minimum (HTA s.172)",
};

export interface NewAlert {
  id: number;
  alertType: AlertType;
  truckNumber: string | null;
  driverId: string | null;
  driverName: string | null;
  thresholdValue: number | null;
  thresholdUnit: string | null;
  thresholdSource: ThresholdSource;
  observedValue: number | null;
  severity: "normal" | "high";
  openedAt: string;
}

interface RuleRow {
  recipient_emails: string[];
  throttle_minutes: number;
  is_active: boolean;
}

// Sends the notification email for a newly-opened alert, respecting the
// per-type notification rule and throttle window (stunt driving is never
// throttled — every occurrence notifies, per spec section 4). Returns
// whether an email was actually sent.
export async function dispatchNotification(alert: NewAlert): Promise<boolean> {
  const [rule] = await query<RuleRow>(
    `SELECT recipient_emails, throttle_minutes, is_active FROM notification_rules WHERE alert_type = $1`,
    [alert.alertType]
  );
  if (!rule || !rule.is_active || rule.recipient_emails.length === 0) return false;

  const throttleMinutes = alert.alertType === "stunt_driving" ? 0 : rule.throttle_minutes;
  if (throttleMinutes > 0 && alert.truckNumber) {
    const [recent] = await query<{ notification_sent_at: string }>(
      `SELECT notification_sent_at FROM alert_history
       WHERE alert_type = $1 AND truck_number = $2 AND notification_sent = TRUE
         AND notification_sent_at > now() - ($3 || ' minutes')::interval
       ORDER BY notification_sent_at DESC LIMIT 1`,
      [alert.alertType, alert.truckNumber, throttleMinutes]
    );
    if (recent) return false; // within the throttle window — skip this email
  }

  const { subject, html } = buildEmail(alert);

  try {
    await sendEmail({ to: rule.recipient_emails, subject, html });
  } catch (err) {
    if (err instanceof EmailNotConfigured) return false;
    throw err;
  }

  await query(
    `UPDATE alert_history SET notification_sent = TRUE, notification_sent_at = now() WHERE id = $1`,
    [alert.id]
  );
  return true;
}

function buildEmail(alert: NewAlert): { subject: string; html: string } {
  const label = ALERT_TYPE_LABELS[alert.alertType];
  const baseUrl = process.env.APP_BASE_URL || "";
  const link = `${baseUrl}/alerts?alert=${alert.id}`;

  const subject =
    alert.alertType === "stunt_driving"
      ? `⚠ LEGAL EXPOSURE — Stunt driving detected — ${alert.truckNumber ?? "unassigned truck"}`
      : `${label} alert — ${alert.truckNumber ?? "unassigned truck"}`;

  const observed = alert.observedValue != null ? `${alert.observedValue}${alert.thresholdUnit === "km_h" ? " km/h" : alert.thresholdUnit === "minutes" ? " min" : ""}` : "—";
  const threshold = alert.thresholdValue != null ? `${alert.thresholdValue}${alert.thresholdUnit === "km_h" ? " km/h" : alert.thresholdUnit === "minutes" ? " min" : ""}` : "on/off";

  const html = `
    <div style="font-family: -apple-system, sans-serif; font-size: 14px; color: #111;">
      ${alert.severity === "high" ? `<p style="color:#b00020; font-weight:600;">Legal exposure — every occurrence of stunt driving is logged and notified, with no throttling.</p>` : ""}
      <table cellpadding="6" style="border-collapse: collapse;">
        <tr><td style="color:#666;">Truck</td><td>${alert.truckNumber ?? "—"}</td></tr>
        <tr><td style="color:#666;">Driver</td><td>${alert.driverName ?? alert.driverId ?? "Unknown"}</td></tr>
        <tr><td style="color:#666;">Alert type</td><td>${label}</td></tr>
        <tr><td style="color:#666;">Observed</td><td>${observed}</td></tr>
        <tr><td style="color:#666;">Threshold</td><td>${threshold} (${SOURCE_LABELS[alert.thresholdSource]})</td></tr>
        <tr><td style="color:#666;">Time</td><td>${new Date(alert.openedAt).toLocaleString("en-CA", { timeZone: "America/Toronto" })}</td></tr>
      </table>
      ${baseUrl ? `<p><a href="${link}">View in the dashboard</a></p>` : ""}
    </div>
  `;

  return { subject, html };
}
