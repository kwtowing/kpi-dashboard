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
  latitude: number | null;
  longitude: number | null;
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
      location:
        [e.location?.formattedAddress, e.location?.address].find((a) => typeof a === "string" && a.length > 0) ?? null,
      // Samsara safety events carry coordinates only (no speed, no street address).
      latitude: typeof e.location?.latitude === "number" ? e.location.latitude : null,
      longitude: typeof e.location?.longitude === "number" ? e.location.longitude : null,
    };
  });
}

export interface SamsaraGpsContext {
  speedMph: number | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
}

// Safety events do not include the vehicle's speed or a street address, so
// both are looked up from the vehicle's GPS history around the moment of the
// event: the reading closest in time to the event is used. A past event never
// changes, so results are cached in memory for as long as the server instance
// lives.
const gpsCache = new Map<string, SamsaraGpsContext>();
const GPS_CACHE_MAX = 5000;

export async function getGpsContext(vehicleId: string, timeIso: string): Promise<SamsaraGpsContext> {
  const key = `${vehicleId}|${timeIso}`;
  const cached = gpsCache.get(key);
  if (cached) return cached;

  const t = new Date(timeIso).getTime();
  const params = new URLSearchParams({
    startTime: new Date(t - 60_000).toISOString(),
    endTime: new Date(t + 30_000).toISOString(),
    vehicleIds: vehicleId,
    types: "gps",
  });
  const res = await fetch(`${BASE}/fleet/vehicles/stats/history?${params.toString()}`, {
    headers: authHeaders(),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Samsara API error ${res.status}: ${await res.text()}`);
  }
  const json = await res.json();
  const points: any[] = (json.data ?? []).flatMap((v: any) => (Array.isArray(v.gps) ? v.gps : []));

  let best: any = null;
  let bestGap = Infinity;
  for (const p of points) {
    const gap = Math.abs(new Date(p.time).getTime() - t);
    if (gap < bestGap) {
      best = p;
      bestGap = gap;
    }
  }

  const ctx: SamsaraGpsContext = best
    ? {
        speedMph: typeof best.speedMilesPerHour === "number" ? best.speedMilesPerHour : null,
        address:
          [best.reverseGeo?.formattedLocation, best.address?.name].find((a) => typeof a === "string" && a.length > 0) ??
          null,
        latitude: typeof best.latitude === "number" ? best.latitude : null,
        longitude: typeof best.longitude === "number" ? best.longitude : null,
      }
    : { speedMph: null, address: null, latitude: null, longitude: null };

  if (gpsCache.size >= GPS_CACHE_MAX) {
    const oldest = gpsCache.keys().next().value;
    if (oldest !== undefined) gpsCache.delete(oldest);
  }
  gpsCache.set(key, ctx);
  return ctx;
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

export interface SamsaraSpeedingContext {
  limitKmh: number | null;
  maxSpeedKmh: number | null;
  severity: string | null;
}

interface SpeedingInterval {
  start: number;
  end: number;
  limitKmh: number;
  maxSpeedKmh: number;
  severity: string;
}

export class SamsaraSpeedLimitUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SamsaraSpeedLimitUnavailable";
  }
}

// Samsara only publishes posted speed limits inside its "speeding intervals"
// (the stretches of a completed trip where the vehicle was over the limit),
// each with the posted limit and the top speed reached. An event that falls
// inside one of those stretches gets its limit; anything else has no limit on
// record. Trips for one vehicle are fetched per hour-long bucket and kept for a
// few minutes, so events from the same vehicle and hour share one lookup.
const HOUR_MS = 60 * 60 * 1000;
const INTERVAL_CACHE_TTL_MS = 15 * 60 * 1000;
const intervalCache = new Map<string, { at: number; intervals: SpeedingInterval[] }>();

async function speedingIntervalsFor(vehicleId: string, bucketStart: number): Promise<SpeedingInterval[]> {
  const key = `${vehicleId}|${bucketStart}`;
  const hit = intervalCache.get(key);
  if (hit && Date.now() - hit.at < INTERVAL_CACHE_TTL_MS) return hit.intervals;

  const intervals: SpeedingInterval[] = [];
  let after: string | undefined;
  for (let page = 0; page < 5; page++) {
    const params = new URLSearchParams({
      assetIds: vehicleId,
      // A trip is listed by when it started, so look back far enough to catch
      // a long trip that began before this hour.
      startTime: new Date(bucketStart - 12 * HOUR_MS).toISOString(),
      endTime: new Date(bucketStart + HOUR_MS).toISOString(),
      queryBy: "tripStartTime",
    });
    if (after) params.set("after", after);
    const res = await fetch(`${BASE}/speeding-intervals/stream?${params.toString()}`, {
      headers: authHeaders(),
      cache: "no-store",
    });
    if (res.status === 401 || res.status === 403) {
      throw new SamsaraSpeedLimitUnavailable("permission");
    }
    if (!res.ok) {
      throw new SamsaraSpeedLimitUnavailable(`Samsara API error ${res.status}`);
    }
    const json = await res.json();
    for (const trip of json.data ?? []) {
      for (const iv of trip.intervals ?? []) {
        const limit = iv.postedSpeedLimitKilometersPerHour;
        const max = iv.maxSpeedKilometersPerHour;
        if (typeof limit !== "number" || typeof max !== "number") continue;
        intervals.push({
          start: new Date(iv.startTime).getTime(),
          end: new Date(iv.endTime).getTime(),
          limitKmh: limit,
          maxSpeedKmh: max,
          severity: String(iv.severityLevel ?? ""),
        });
      }
    }
    if (!json.pagination?.hasNextPage || !json.pagination?.endCursor) break;
    after = json.pagination.endCursor;
  }

  if (intervalCache.size >= 2000) {
    const oldest = intervalCache.keys().next().value;
    if (oldest !== undefined) intervalCache.delete(oldest);
  }
  intervalCache.set(key, { at: Date.now(), intervals });
  return intervals;
}

export async function getSpeedingContext(vehicleId: string, timeIso: string): Promise<SamsaraSpeedingContext> {
  const t = new Date(timeIso).getTime();
  const bucketStart = Math.floor(t / HOUR_MS) * HOUR_MS;
  const intervals = await speedingIntervalsFor(vehicleId, bucketStart);

  // The event counts as inside a speeding stretch if it falls within it,
  // allowing a minute either side for clock differences.
  const TOLERANCE_MS = 60_000;
  const match = intervals
    .filter((iv) => t >= iv.start - TOLERANCE_MS && t <= iv.end + TOLERANCE_MS)
    .sort((a, b) => b.maxSpeedKmh - a.maxSpeedKmh)[0];

  return match
    ? { limitKmh: match.limitKmh, maxSpeedKmh: match.maxSpeedKmh, severity: match.severity || null }
    : { limitKmh: null, maxSpeedKmh: null, severity: null };
}
