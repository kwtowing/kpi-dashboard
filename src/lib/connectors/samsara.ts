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
    reverseGeo?: { formattedLocation?: string };
  };
  obdOdometerMeters?: { value: number; time: string };
}

export async function listVehiclesWithStats(): Promise<SamsaraVehicleStat[]> {
  const res = await fetch(`${BASE}/fleet/vehicles/stats?types=gps,obdOdometerMeters`, {
    headers: authHeaders(),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Samsara API error ${res.status}: ${await res.text()}`);
  }
  const json = await res.json();
  return (json.data ?? []) as SamsaraVehicleStat[];
}
