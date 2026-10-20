import { query } from "@/lib/db";

// Samsara shows "Unknown" for a safety event when nobody was signed in to the
// vehicle. This table remembers who normally drives a given vehicle, so those
// events can be shown under that driver's name instead.
//
// The table is created on first use (nothing to run by hand), and starts with
// KW 47 - Rattler assigned to Adel Shah. The starting row is only added when
// the table is first created, so removing or changing it later sticks.

let ready: Promise<void> | null = null;

export function normalizeVehicle(name: string | null | undefined): string {
  return (name ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

export function ensureVehicleDriverTable(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      const exists = await query<{ t: string | null }>(`SELECT to_regclass('vehicle_default_driver') AS t`);
      if (exists[0]?.t) return;
      await query(
        `CREATE TABLE IF NOT EXISTS vehicle_default_driver (
           vehicle_name TEXT PRIMARY KEY,
           driver_name  TEXT NOT NULL,
           updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
         )`
      );
      await query(
        `INSERT INTO vehicle_default_driver (vehicle_name, driver_name)
         VALUES ('kw 47 - rattler', 'Adel Shah')
         ON CONFLICT (vehicle_name) DO NOTHING`
      );
    })().catch((err) => {
      ready = null; // try again next time
      throw err;
    });
  }
  return ready;
}

export async function loadVehicleDrivers(): Promise<Map<string, string>> {
  await ensureVehicleDriverTable();
  const rows = await query<{ vehicle_name: string; driver_name: string }>(
    `SELECT vehicle_name, driver_name FROM vehicle_default_driver`
  );
  return new Map(rows.map((r) => [normalizeVehicle(r.vehicle_name), r.driver_name]));
}
