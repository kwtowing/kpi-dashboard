import { query } from "@/lib/db";

export type AlertType =
  | "speeding"
  | "stunt_driving"
  | "excessive_idle"
  | "harsh_braking"
  | "harsh_acceleration"
  | "harsh_cornering";

export const ALERT_TYPES: AlertType[] = [
  "speeding",
  "stunt_driving",
  "excessive_idle",
  "harsh_braking",
  "harsh_acceleration",
  "harsh_cornering",
];

export type ThresholdSource = "driver" | "truck" | "global" | "legal";

export interface ResolvedThreshold {
  thresholdValue: number | null;
  unit: string | null;
  graceSeconds: number;
  isActive: boolean;
  source: ThresholdSource;
}

interface DefaultRow {
  threshold_value: string | null;
  unit: string | null;
  grace_seconds: number;
  is_active: boolean;
}

interface OverrideRow {
  threshold_value: string | null;
  unit: string | null;
  is_active: boolean;
}

// Resolution order: driver override -> truck override -> global default.
// Overrides only apply while active and within their effective date range.
export async function resolveThreshold(
  alertType: AlertType,
  truckNumber: string | null,
  driverId: string | null
): Promise<ResolvedThreshold> {
  if (driverId) {
    const [row] = await query<OverrideRow>(
      `SELECT threshold_value, unit, is_active FROM alert_threshold_overrides
       WHERE scope = 'driver' AND driver_id = $1 AND alert_type = $2 AND is_active = TRUE
         AND effective_from <= now() AND (effective_to IS NULL OR effective_to > now())
       ORDER BY effective_from DESC LIMIT 1`,
      [driverId, alertType]
    );
    if (row) return fromOverride(row, "driver");
  }

  if (truckNumber) {
    const [row] = await query<OverrideRow>(
      `SELECT threshold_value, unit, is_active FROM alert_threshold_overrides
       WHERE scope = 'truck' AND truck_number = $1 AND alert_type = $2 AND is_active = TRUE
         AND effective_from <= now() AND (effective_to IS NULL OR effective_to > now())
       ORDER BY effective_from DESC LIMIT 1`,
      [truckNumber, alertType]
    );
    if (row) return fromOverride(row, "truck");
  }

  const [def] = await query<DefaultRow>(
    `SELECT threshold_value, unit, grace_seconds, is_active FROM alert_threshold_defaults WHERE alert_type = $1`,
    [alertType]
  );
  const source: ThresholdSource = alertType === "stunt_driving" ? "legal" : "global";
  if (!def) {
    return { thresholdValue: null, unit: null, graceSeconds: 0, isActive: false, source };
  }
  return {
    thresholdValue: def.threshold_value !== null ? Number(def.threshold_value) : null,
    unit: def.unit,
    graceSeconds: def.grace_seconds,
    isActive: def.is_active,
    source,
  };
}

function fromOverride(row: OverrideRow, source: ThresholdSource): ResolvedThreshold {
  return {
    thresholdValue: row.threshold_value !== null ? Number(row.threshold_value) : null,
    unit: row.unit,
    graceSeconds: 0,
    isActive: row.is_active,
    source,
  };
}

// Ontario HTA s.172 legal minimum "over by" amount for the given posted
// limit — fixed by law, never configurable.
export function legalStuntOverBy(postedLimitKmh: number): number {
  return postedLimitKmh < 80 ? 40 : 50;
}

// Fires when any of the following is true:
// - Posted limit under 80 km/h -> vehicle speed is 40+ km/h over
// - Posted limit 80 km/h or higher -> vehicle speed is 50+ km/h over
// - Vehicle speed exceeds 150 km/h, regardless of posted limit
//
// `stricterOverBy`, if a driver/truck override supplies one, may only
// tighten the legal minimum — never loosen it — enforced here by clamping
// it to at most the legal minimum for this posted limit.
export function isStuntDriving(
  speedKmh: number,
  postedLimitKmh: number,
  stricterOverBy?: number | null
): boolean {
  if (speedKmh > 150) return true;
  const overBy = speedKmh - postedLimitKmh;
  const legalOverBy = legalStuntOverBy(postedLimitKmh);
  const requiredOverBy = stricterOverBy != null ? Math.min(stricterOverBy, legalOverBy) : legalOverBy;
  return overBy >= requiredOverBy;
}
