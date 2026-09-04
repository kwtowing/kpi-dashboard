// Alert evaluation — reuses the existing Samsara connector from Phase 3
// (no second ingestion path). Meant to be run periodically by a Vercel
// Cron hitting /api/alerts/evaluate (see vercel.json).
//
// Speeding, stunt driving, and the harsh_* types are derived from
// Samsara's safety-event feed, matching src/app/driver-behaviour's
// existing use of listSafetyEvents. Excessive idling is derived from the
// vehicle-stats snapshot (listVehiclesWithStats) plus a small
// truck_engine_state tracker, since that endpoint reports current engine
// state, not a running duration.
//
// Posted-speed-limit data for stunt driving comes from a Samsara speeding
// event's own postedSpeedMph field — confirmed available on the connected
// plan, same as the harsh acceleration/cornering events used below. On the
// rare event that doesn't carry a posted limit, only the flat "speed
// exceeds 150 km/h" clause can be evaluated for it.

import { query } from "@/lib/db";
import {
  listVehiclesWithStats,
  listSafetyEvents,
  getCurrentDriverVehicleAssignments,
  SamsaraNotConfigured,
  SamsaraVehicleStat,
} from "@/lib/connectors/samsara";
import { resolveThreshold, isStuntDriving, legalStuntOverBy, AlertType, ResolvedThreshold } from "./thresholds";
import { dispatchNotification } from "./notify";

const MPH_TO_KMH = 1.60934;
const EVENT_LOOKBACK_MS = 15 * 60 * 1000;

function normalize(s: string) {
  return s.trim().toLowerCase();
}

interface TruckRow {
  truck_number: string;
  samsara_name: string | null;
  samsara_vehicle_id: string | null;
}

interface DriverRow {
  driver_id: string;
  driver_name: string | null;
  samsara_driver_id: string;
}

export interface EvaluationSummary {
  ran: boolean;
  reason?: string;
  trucksChecked: number;
  safetyEventsProcessed: number;
  alertsOpened: number;
  notificationsSent: number;
}

export async function evaluateAlerts(): Promise<EvaluationSummary> {
  const trucks = await query<TruckRow>(
    `SELECT truck_number, samsara_name, samsara_vehicle_id FROM truck_master WHERE status = 'active'`
  );
  const drivers = await query<DriverRow>(
    `SELECT driver_id, driver_name, samsara_driver_id FROM driver_master
     WHERE samsara_driver_id IS NOT NULL AND samsara_driver_id <> ''`
  );
  const samsaraIdToDriver = new Map(drivers.map((d) => [d.samsara_driver_id, d]));

  let vehicles: SamsaraVehicleStat[];
  let assignments: Awaited<ReturnType<typeof getCurrentDriverVehicleAssignments>>;
  try {
    [vehicles, assignments] = await Promise.all([
      listVehiclesWithStats(),
      getCurrentDriverVehicleAssignments(drivers.map((d) => d.samsara_driver_id)),
    ]);
  } catch (err: any) {
    if (err instanceof SamsaraNotConfigured) {
      return { ran: false, reason: "not_configured", trucksChecked: 0, safetyEventsProcessed: 0, alertsOpened: 0, notificationsSent: 0 };
    }
    return { ran: false, reason: `api_error: ${err.message}`, trucksChecked: 0, safetyEventsProcessed: 0, alertsOpened: 0, notificationsSent: 0 };
  }

  // Truck <-> Samsara vehicle, matched the same way as src/app/trucks/page.tsx:
  // by stored samsara_vehicle_id, else by samsara_name (falling back to the
  // truck code) normalized against the vehicle's Samsara name.
  const truckToVehicle = new Map<string, SamsaraVehicleStat>();
  const vehicleIdToTruck = new Map<string, string>();
  for (const t of trucks) {
    const targetName = t.samsara_name || t.truck_number;
    const vehicle =
      (t.samsara_vehicle_id && vehicles.find((v) => v.id === t.samsara_vehicle_id)) ||
      vehicles.find((v) => normalize(v.name) === normalize(targetName));
    if (vehicle) {
      truckToVehicle.set(t.truck_number, vehicle);
      vehicleIdToTruck.set(vehicle.id, t.truck_number);
    }
  }

  // Samsara vehicleId -> currently assigned internal driver, from the live
  // driver-vehicle-assignments feed (Phase 3).
  const vehicleIdToDriver = new Map<string, DriverRow>();
  for (const a of assignments) {
    const driver = samsaraIdToDriver.get(a.driverId);
    if (driver) vehicleIdToDriver.set(a.vehicleId, driver);
  }

  let alertsOpened = 0;
  let notificationsSent = 0;

  async function openAlert(args: {
    alertType: AlertType;
    truckNumber: string | null;
    driverId: string | null;
    driverName: string | null;
    threshold: ResolvedThreshold;
    observedValue: number | null;
    severity: "normal" | "high";
    externalEventId: string;
  }) {
    const rows = await query<{ id: number; opened_at: string }>(
      `INSERT INTO alert_history
         (alert_type, truck_number, driver_id, threshold_value, threshold_source, observed_value, severity, external_event_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (alert_type, external_event_id) WHERE external_event_id IS NOT NULL DO NOTHING
       RETURNING id, opened_at`,
      [
        args.alertType,
        args.truckNumber,
        args.driverId,
        args.threshold.thresholdValue,
        args.threshold.source,
        args.observedValue,
        args.severity,
        args.externalEventId,
      ]
    );
    if (!rows[0]) return;
    alertsOpened++;
    const sent = await dispatchNotification({
      id: rows[0].id,
      alertType: args.alertType,
      truckNumber: args.truckNumber,
      driverId: args.driverId,
      driverName: args.driverName,
      thresholdValue: args.threshold.thresholdValue,
      thresholdUnit: args.threshold.unit,
      thresholdSource: args.threshold.source,
      observedValue: args.observedValue,
      severity: args.severity,
      openedAt: rows[0].opened_at,
    });
    if (sent) notificationsSent++;
  }

  // --- Excessive idling: continuous engine state, tracked across ticks. ---
  for (const t of trucks) {
    const vehicle = truckToVehicle.get(t.truck_number);
    const state = vehicle?.engineStates?.value;
    if (!vehicle || !state) continue;

    const [prev] = await query<{ engine_state: string; since: string }>(
      `SELECT engine_state, since FROM truck_engine_state WHERE truck_number = $1`,
      [t.truck_number]
    );

    if (!prev || prev.engine_state !== state) {
      await query(
        `INSERT INTO truck_engine_state (truck_number, engine_state, since, updated_at)
         VALUES ($1, $2, now(), now())
         ON CONFLICT (truck_number) DO UPDATE SET engine_state = EXCLUDED.engine_state, since = EXCLUDED.since, updated_at = now()`,
        [t.truck_number, state]
      );
      if (prev?.engine_state === "Idle" && state !== "Idle") {
        await query(
          `UPDATE alert_history SET status = 'resolved', resolved_at = now()
           WHERE truck_number = $1 AND alert_type = 'excessive_idle' AND status = 'open'`,
          [t.truck_number]
        );
      }
      continue; // just entered this state — nothing to evaluate yet
    }

    if (state !== "Idle") continue;

    const driver = vehicleIdToDriver.get(vehicle.id) ?? null;
    const threshold = await resolveThreshold("excessive_idle", t.truck_number, driver?.driver_id ?? null);
    if (!threshold.isActive || threshold.thresholdValue == null) continue;

    const elapsedSeconds = (Date.now() - new Date(prev.since).getTime()) / 1000;
    const requiredSeconds = threshold.thresholdValue * 60 + threshold.graceSeconds;
    if (elapsedSeconds < requiredSeconds) continue;

    const [alreadyOpen] = await query<{ id: number }>(
      `SELECT id FROM alert_history WHERE truck_number = $1 AND alert_type = 'excessive_idle' AND status = 'open'`,
      [t.truck_number]
    );
    if (alreadyOpen) continue;

    await openAlert({
      alertType: "excessive_idle",
      truckNumber: t.truck_number,
      driverId: driver?.driver_id ?? null,
      driverName: driver?.driver_name ?? null,
      threshold,
      observedValue: Math.round(elapsedSeconds / 60),
      severity: "normal",
      externalEventId: `idle:${t.truck_number}:${prev.since}`,
    });
  }

  // --- Event-based alerts, from Samsara's safety-event feed. ---
  const [lastEvent] = await query<{ opened_at: string }>(
    `SELECT opened_at FROM alert_history WHERE alert_type <> 'excessive_idle' ORDER BY opened_at DESC LIMIT 1`
  );
  const lookbackFloor = Date.now() - EVENT_LOOKBACK_MS;
  const startTime = new Date(lastEvent ? Math.max(new Date(lastEvent.opened_at).getTime(), lookbackFloor) : lookbackFloor).toISOString();
  const endTime = new Date().toISOString();

  const events = drivers.length > 0 ? await listSafetyEvents(startTime, endTime, drivers.map((d) => d.samsara_driver_id)) : [];

  for (const e of events) {
    const truckNumber = e.vehicleId ? vehicleIdToTruck.get(e.vehicleId) ?? null : null;
    const driver = e.driverId ? samsaraIdToDriver.get(e.driverId) ?? null : null;
    const driverName = driver?.driver_name ?? e.driverName;
    const labels = e.behaviorLabels.map((l) => l.toLowerCase());

    if (labels.some((l) => l.includes("speed")) && e.speedMph != null) {
      const speedKmh = e.speedMph * MPH_TO_KMH;
      const postedKmh = e.postedSpeedMph != null ? e.postedSpeedMph * MPH_TO_KMH : null;

      const stuntThreshold = await resolveThreshold("stunt_driving", truckNumber, driver?.driver_id ?? null);
      const stricterOverBy = stuntThreshold.source !== "legal" ? stuntThreshold.thresholdValue : null;
      const isStunt = postedKmh != null ? isStuntDriving(speedKmh, postedKmh, stricterOverBy) : speedKmh > 150;

      if (isStunt) {
        const cutoff = postedKmh != null ? postedKmh + (stricterOverBy ?? legalStuntOverBy(postedKmh)) : 150;
        await openAlert({
          alertType: "stunt_driving",
          truckNumber,
          driverId: driver?.driver_id ?? null,
          driverName,
          threshold: { ...stuntThreshold, thresholdValue: Math.round(cutoff), unit: "km_h" },
          observedValue: Math.round(speedKmh),
          severity: "high",
          externalEventId: e.id,
        });
      } else {
        const speedingThreshold = await resolveThreshold("speeding", truckNumber, driver?.driver_id ?? null);
        if (speedingThreshold.isActive && speedingThreshold.thresholdValue != null) {
          const overOrFlat = postedKmh != null ? speedKmh - postedKmh >= speedingThreshold.thresholdValue : speedKmh >= speedingThreshold.thresholdValue;
          if (overOrFlat) {
            const cutoff = postedKmh != null ? postedKmh + speedingThreshold.thresholdValue : speedingThreshold.thresholdValue;
            await openAlert({
              alertType: "speeding",
              truckNumber,
              driverId: driver?.driver_id ?? null,
              driverName,
              threshold: { ...speedingThreshold, thresholdValue: Math.round(cutoff), unit: "km_h" },
              observedValue: Math.round(speedKmh),
              severity: "normal",
              externalEventId: e.id,
            });
          }
        }
      }
    }

    const harshMap: [boolean, AlertType][] = [
      [labels.some((l) => l.includes("brak")), "harsh_braking"],
      [labels.some((l) => l.includes("accel")), "harsh_acceleration"],
      [labels.some((l) => l.includes("corner") || l.includes("turn")), "harsh_cornering"],
    ];
    for (const [matched, alertType] of harshMap) {
      if (!matched) continue;
      const threshold = await resolveThreshold(alertType, truckNumber, driver?.driver_id ?? null);
      if (!threshold.isActive) continue;
      await openAlert({
        alertType,
        truckNumber,
        driverId: driver?.driver_id ?? null,
        driverName,
        threshold,
        observedValue: null,
        severity: "normal",
        externalEventId: `${e.id}:${alertType}`,
      });
    }
  }

  return { ran: true, trucksChecked: trucks.length, safetyEventsProcessed: events.length, alertsOpened, notificationsSent };
}
