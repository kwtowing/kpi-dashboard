import { NextRequest, NextResponse } from "next/server";
import {
  listSafetyEvents,
  listSpeedingEvents,
  listVehicleDriverStretches,
  SamsaraNotConfigured,
  SamsaraSpeedLimitUnavailable,
} from "@/lib/connectors/samsara";
import { query } from "@/lib/db";
import { loadVehicleDrivers, normalizeVehicle } from "@/lib/vehicleDriver";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  // Default to the last 7 days if no range given.
  const endTime = to ? new Date(`${to}T23:59:59Z`).toISOString() : new Date().toISOString();
  const startTime = from
    ? new Date(`${from}T00:00:00Z`).toISOString()
    : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  try {
    const driverRows = await query<{ driver_id: string; driver_name: string | null; samsara_driver_id: string }>(
      `SELECT driver_id, driver_name, samsara_driver_id FROM driver_master
       WHERE samsara_driver_id IS NOT NULL AND samsara_driver_id <> ''`
    );
    const samsaraIds = driverRows.map((d) => d.samsara_driver_id);
    const idToInternal = new Map(driverRows.map((d) => [d.samsara_driver_id, d]));

    const events = await listSafetyEvents(startTime, endTime, samsaraIds);

    // When nobody was signed in to the vehicle Samsara gives no driver; fall
    // back to whoever is set as that vehicle's usual driver.
    let vehicleDrivers = new Map<string, string>();
    try {
      vehicleDrivers = await loadVehicleDrivers();
    } catch {
      // Leave those events as "Unknown" rather than failing the whole page.
    }

    // Speeding is kept by Samsara as "speeding intervals" rather than safety
    // events, so it is fetched separately and added to the same list. If that
    // part fails (usually a missing token permission) the rest still shows.
    let speedingNote: string | null = null;
    const speedingRows: typeof events = [];
    try {
      const speeding = (await listSpeedingEvents(startTime, endTime)).filter((sp) => !sp.dismissed);
      // Skip any that Samsara already reported as a "Speeding" safety event.
      const already = events.filter((e) => e.behaviorLabels.some((l) => /speed/i.test(l)));
      const fresh = speeding.filter(
        (sp) =>
          !already.some(
            (e) => e.vehicleId === sp.vehicleId && Math.abs(new Date(e.time).getTime() - new Date(sp.time).getTime()) < 120_000
          )
      );
      let stretches = new Map<string, { driverId: string; driverName: string | null; start: number; end: number }[]>();
      try {
        stretches = await listVehicleDriverStretches(
          [...new Set(fresh.map((f) => f.vehicleId))],
          new Date(new Date(startTime).getTime() - 12 * 3600_000).toISOString(),
          endTime
        );
      } catch {
        // Drivers stay unknown (or fall back to the vehicle's usual driver).
      }
      for (const sp of fresh) {
        const t = new Date(sp.time).getTime();
        const who = (stretches.get(sp.vehicleId) ?? []).find((x) => t >= x.start && t <= x.end);
        speedingRows.push({
          id: sp.id,
          time: sp.time,
          driverId: who?.driverId ?? null,
          driverName: who?.driverName ?? null,
          vehicleId: sp.vehicleId,
          vehicleName: sp.vehicleName,
          behaviorLabels: ["Speeding"],
          severity: sp.severity,
          speedMph: null,
          postedSpeedMph: null,
          location: null,
          latitude: null,
          longitude: null,
          speedKmh: sp.maxSpeedKmh,
          postedKmh: sp.limitKmh,
          speedingSeconds: Math.max(0, Math.round((new Date(sp.endTime).getTime() - t) / 1000)),
        } as any);
      }
    } catch (err: any) {
      speedingNote = err instanceof SamsaraSpeedLimitUnavailable ? err.message : "error";
    }

    const enriched = [...events, ...speedingRows].map((e) => {
      const internal = e.driverId ? idToInternal.get(e.driverId) : undefined;
      const samsaraName = internal?.driver_name ?? e.driverName;
      const assumed = !samsaraName && !e.driverId ? vehicleDrivers.get(normalizeVehicle(e.vehicleName)) ?? null : null;
      return {
        ...e,
        internalDriverId: internal?.driver_id ?? null,
        internalDriverName: samsaraName ?? assumed,
        driverAssumed: Boolean(assumed),
      };
    });

    // Summary counts by behavior label and by driver, for quick scanning.
    const byLabel: Record<string, number> = {};
    const byDriver: Record<string, { name: string; count: number }> = {};
    for (const e of enriched) {
      for (const label of e.behaviorLabels.length > 0 ? e.behaviorLabels : ["Unspecified"]) {
        byLabel[label] = (byLabel[label] ?? 0) + 1;
      }
      const key = e.internalDriverId ?? e.driverId ?? "unknown";
      const name = e.internalDriverName ?? e.driverName ?? "Unknown driver";
      if (!byDriver[key]) byDriver[key] = { name, count: 0 };
      byDriver[key].count += 1;
    }

    return NextResponse.json({
      connected: true,
      range: { from: startTime, to: endTime },
      events: enriched,
      speedingUnavailable: speedingNote,
      summary: {
        total: enriched.length,
        byLabel,
        byDriver,
      },
    });
  } catch (err: any) {
    if (err instanceof SamsaraNotConfigured) {
      return NextResponse.json({ connected: false, reason: "not_configured", events: [] });
    }
    return NextResponse.json(
      { connected: false, reason: "api_error", error: err.message, events: [] },
      { status: 200 }
    );
  }
}
