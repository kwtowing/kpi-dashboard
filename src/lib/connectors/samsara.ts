// Connector for Samsara's fleet API.
// Docs: https://developers.samsara.com/reference/listvehicles
// Requires the SAMSARA_API_TOKEN environment variable (server-side only —
// Samsara does not support CORS, so this must never be called from the browser).

const BASE = "https://api.samsara.com";

export class SamsaraNotConfigured extends Error {
  constructor() {
    super("SAMSARA_API_TOKEN is not set");
    this.name = "SamsaraNotConfigured";
  }
}

function authHeaders() {
  const token = process.env.SAMSARA_API_TOKEN;
  if (!token) throw new SamsaraNotConfigured();
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

export interface SamsaraVehicleStat {
  id: string;
  name: string;
  gps?: {
    latitude: number;
    longitude: number;
    time: string;
    speedMilesPerHour?: number;
    reverseGeo?: { formattedLocation?: string };
  };
  obdOdometerMeters?: { value: number; time: string };
  engineStates?: { value: string; time: string }; // "Off" | "Idle" | "On"
  fuelPercents?: { value: number; time: string };
}

const STAT_TYPES = "gps,obdOdometerMeters,engineStates,fuelPercents";

export async function listVehiclesWithStats(): Promise<SamsaraVehicleStat[]> {
  const res = await fetch(`${BASE}/fleet/vehicles/stats?types=${STAT_TYPES}`, {
    headers: authHeaders(),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Samsara API error ${res.status}: ${await res.text()}`);
  }
  const json = await res.json();
  return (json.data ?? []) as SamsaraVehicleStat[];
}

export interface SamsaraDriver {
  id: string;
  name: string;
  username?: string;
}

export async function listDrivers(): Promise<SamsaraDriver[]> {
  const res = await fetch(`${BASE}/fleet/drivers`, {
    headers: authHeaders(),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Samsara API error ${res.status}: ${await res.text()}`);
  }
  const json = await res.json();
  const data = (json.data ?? []) as any[];
  return data.map((d) => ({ id: String(d.id), name: d.name, username: d.username }));
}
export interface SamsaraSafetyEvent {
  id: string;
  time: string;
  driverId: string | null;
  driverName: string | null;
  vehicleId: string | null;
  vehicleName: string | null;
  behaviorLabels: string[];
  severity: string | null;
  speedMph: number | null;
  postedSpeedMph: number | null;
  location: string | null;
}

// Driver behaviour / safety events (speeding, harsh braking, harsh
// acceleration, harsh cornering, etc.) within a time window. Samsara's docs
// for this endpoint have shifted across API versions, so this is written
// defensively — it extracts whatever shape of driver/vehicle/behavior data
// is present rather than assuming one exact schema, and surfaces the raw
// error text on failure so a mismatch is diagnosable rather than silent.
export async function listSafetyEvents(
  startTime: string,
  endTime: string,
  driverIds?: string[]
): Promise<SamsaraSafetyEvent[]> {
  const params = new URLSearchParams({ startTime, endTime });
  if (driverIds && driverIds.length > 0) {
    params.set("driverIds", driverIds.join(","));
  }
  const res = await fetch(`${BASE}/fleet/safety-events?${params.toString()}`, {
    headers: authHeaders(),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Samsara API error ${res.status}: ${await res.text()}`);
  }
  const json = await res.json();
  const data = (json.data ?? []) as any[];
  return data.map((e) => {
    const labelsRaw = e.behaviorLabels ?? e.eventTypes ?? (e.behaviorLabel ? [e.behaviorLabel] : []);
    const behaviorLabels: string[] = Array.isArray(labelsRaw)
      ? labelsRaw.map((b: any) => (typeof b === "string" ? b : b.name ?? b.label ?? JSON.stringify(b)))
      : [];
    return {
      id: String(e.id ?? e.uuid ?? `${e.time}-${e.driver?.id ?? ""}`),
      time: e.time ?? e.happenedAtTime,
      driverId: e.driver?.id ? String(e.driver.id) : null,
      driverName: e.driver?.name ?? null,
      vehicleId: e.vehicle?.id ? String(e.vehicle.id) : null,
      vehicleName: e.vehicle?.name ?? null,
      behaviorLabels,
      severity: e.severity ?? e.harshEvent?.severity ?? null,
      speedMph: e.speedingEvent?.speedMph ?? e.harshEvent?.speedAtEventMph ?? null,
      postedSpeedMph: e.speedingEvent?.postedSpeedMph ?? null,
      location: e.location?.formattedAddress ?? e.location?.address ?? null,
    };
  });
}

export interface SamsaraAssignment {
  driverId: string;
  driverName: string | null;
  vehicleId: string;
  vehicleName: string | null;
  startTime: string;
  endTime: string | null;
}

// Current driver <-> vehicle assignments — who's in what truck right now.
// Samsara requires filtering by a specific set of driver or vehicle IDs
// (a bare time-window query is rejected), so this takes the driver IDs
// we actually care about — the ones with a samsara_driver_id set in
// driver_master.
export async function getCurrentDriverVehicleAssignments(driverIds: string[]): Promise<SamsaraAssignment[]> {
  if (driverIds.length === 0) return [];

  const now = new Date();
  const start = new Date(now.getTime() - 5 * 60 * 1000); // 5 min lookback
  const params = new URLSearchParams({
    startTime: start.toISOString(),
    endTime: now.toISOString(),
    filterBy: "drivers",
    driverIds: driverIds.join(","),
  });
  const res = await fetch(`${BASE}/fleet/driver-vehicle-assignments?${params.toString()}`, {
    headers: authHeaders(),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Samsara API error ${res.status}: ${await res.text()}`);
  }
  const json = await res.json();
  const data = (json.data ?? []) as any[];
  return data.map((a) => ({
    driverId: String(a.driver?.id ?? a.driverId ?? ""),
    driverName: a.driver?.name ?? null,
    vehicleId: String(a.vehicle?.id ?? a.vehicleId ?? ""),
    vehicleName: a.vehicle?.name ?? null,
    startTime: a.startTime,
    endTime: a.endTime ?? null,
  }));
}
