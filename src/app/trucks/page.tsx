"use client";

import { useEffect, useState, useCallback } from "react";
import DateRangeFilter, { DateRange } from "@/components/DateRangeFilter";

type TruckRow = {
  truck: string;
  call_count: number;
  km_paid: number;
  total_cost: number;
  last_used: string;
  samsara_name: string | null;
  recent_driver_id: string | null;
};

type SamsaraVehicle = {
  id: string;
  name: string;
  gps?: { latitude: number; longitude: number; time: string; reverseGeo?: { formattedLocation?: string } };
  obdOdometerMeters?: { value: number; time: string };
};

type Assignment = {
  driverId: string;
  vehicleId: string;
  vehicleName: string | null;
};

type Driver = { driver_id: string; samsara_driver_id: string | null };

function normalize(s: string) {
  return s.trim().toLowerCase();
}

export default function TrucksPage() {
  const [trucks, setTrucks] = useState<TruckRow[]>([]);
  const [vehicles, setVehicles] = useState<SamsaraVehicle[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [connected, setConnected] = useState(true);
  const [samsaraError, setSamsaraError] = useState<string | null>(null);
  const [assignmentsError, setAssignmentsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<DateRange>({ from: null, to: null });

  const load = useCallback(async (r: DateRange) => {
    setLoading(true);
    const suffix = r.from && r.to ? `?from=${r.from}&to=${r.to}` : "";
    const [truckRes, samsaraRes, assignRes, driverRes] = await Promise.all([
      fetch(`/api/truck-report${suffix}`).then((res) => res.json()),
      fetch("/api/samsara/vehicles").then((res) => res.json()),
      fetch("/api/samsara/assignments").then((res) => res.json()),
      fetch("/api/drivers").then((res) => res.json()),
    ]);
    setTrucks(truckRes.rows ?? []);
    setVehicles(samsaraRes.vehicles ?? []);
    setConnected(samsaraRes.connected);
    setSamsaraError(samsaraRes.reason === "api_error" ? samsaraRes.error : null);
    setAssignments(assignRes.assignments ?? []);
    setAssignmentsError(assignRes.reason === "api_error" ? assignRes.error : null);
    setDrivers(driverRes.drivers ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load(range);
  }, [range, load]);

  const matched = trucks.map((t) => {
    // Primary: who most recently drove this truck -> their Samsara driver ID
    // -> Samsara's current assignment for that driver -> the vehicle.
    let vehicle: SamsaraVehicle | undefined;
    let matchedVia: "assignment" | "name" | null = null;

    if (t.recent_driver_id) {
      const driver = drivers.find((d) => d.driver_id === t.recent_driver_id);
      if (driver?.samsara_driver_id) {
        const assignment = assignments.find((a) => a.driverId === driver.samsara_driver_id);
        if (assignment) {
          vehicle = vehicles.find((v) => v.id === assignment.vehicleId);
          if (vehicle) matchedVia = "assignment";
        }
      }
    }

    // Fallback: manually-set Samsara vehicle name, or the truck code itself.
    if (!vehicle) {
      const targetName = t.samsara_name || t.truck;
      vehicle = vehicles.find((v) => normalize(v.name) === normalize(targetName));
      if (vehicle) matchedVia = "name";
    }

    return { ...t, vehicle, matchedVia };
  });

  return (
    <div className="px-4 sm:px-8 py-6 sm:py-8 max-w-5xl">
      <h1 className="font-display italic text-3xl mb-1">Trucks on the CAA project</h1>
      <p className="text-sm text-[var(--ink-muted)] mb-4">
        Usage and revenue from CAA calls, matched with live location and odometer from Samsara.
      </p>
      <div className="mb-8">
        <DateRangeFilter onChange={setRange} />
      </div>

      {!connected && !samsaraError && (
        <div className="card px-5 py-4 mb-6" style={{ borderColor: "var(--accent)" }}>
          <div className="text-sm font-medium mb-1">Samsara isn&apos;t connected yet</div>
          <p className="text-xs text-[var(--ink-muted)] leading-relaxed">
            Once you have a Samsara API token, add it in Vercel under your project&apos;s{" "}
            <strong>Settings → Environment Variables</strong> as{" "}
            <code className="font-mono-num">SAMSARA_API_TOKEN</code>, then redeploy. Live
            location and odometer will appear here automatically — the truck usage numbers
            below already work without it.
          </p>
        </div>
      )}

      {samsaraError && (
        <div className="card px-5 py-4 mb-6" style={{ borderColor: "var(--cost)" }}>
          <div className="text-sm font-medium mb-1" style={{ color: "var(--cost)" }}>
            Samsara connection failed
          </div>
          <p className="text-xs text-[var(--ink-muted)] leading-relaxed font-mono-num">{samsaraError}</p>
        </div>
      )}

      {connected && assignmentsError && (
        <div className="card px-5 py-4 mb-6" style={{ borderColor: "var(--cost)" }}>
          <div className="text-sm font-medium mb-1" style={{ color: "var(--cost)" }}>
            Driver-vehicle assignment lookup failed
          </div>
          <p className="text-xs text-[var(--ink-muted)] leading-relaxed font-mono-num">{assignmentsError}</p>
          <p className="text-xs text-[var(--ink-muted)] mt-2">
            Falling back to name-based matching below.
          </p>
        </div>
      )}

      {loading ? (
        <div className="text-sm text-[var(--ink-muted)]">Loading…</div>
      ) : trucks.length === 0 ? (
        <div className="card px-5 py-10 text-sm text-[var(--ink-muted)] text-center">
          No truck data yet — import a CAA report to see trucks used.
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[var(--ink-muted)] text-xs border-b border-[var(--line)]">
                <th className="px-5 py-2 font-normal">Truck</th>
                <th className="px-5 py-2 font-normal">Calls</th>
                <th className="px-5 py-2 font-normal">KM paid</th>
                <th className="px-5 py-2 font-normal">Total cost</th>
                <th className="px-5 py-2 font-normal">Last used</th>
                <th className="px-5 py-2 font-normal">Samsara location</th>
                <th className="px-5 py-2 font-normal">Odometer</th>
                <th className="px-5 py-2 font-normal">Matched via</th>
              </tr>
            </thead>
            <tbody>
              {matched.map((t) => (
                <tr key={t.truck} className="border-t border-[var(--line)]">
                  <td className="px-5 py-2.5 font-medium">{t.truck}</td>
                  <td className="px-5 py-2.5 font-mono-num">{t.call_count}</td>
                  <td className="px-5 py-2.5 font-mono-num">{Number(t.km_paid).toLocaleString()}</td>
                  <td className="px-5 py-2.5 font-mono-num" style={{ color: "var(--revenue)" }}>
                    ${Number(t.total_cost).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </td>
                  <td className="px-5 py-2.5 text-xs text-[var(--ink-muted)]">
                    {new Date(t.last_used).toLocaleDateString()}
                  </td>
                  <td className="px-5 py-2.5 text-xs">
                    {t.vehicle?.gps?.reverseGeo?.formattedLocation ??
                      (t.vehicle?.gps ? `${t.vehicle.gps.latitude.toFixed(3)}, ${t.vehicle.gps.longitude.toFixed(3)}` : "—")}
                  </td>
                  <td className="px-5 py-2.5 font-mono-num text-xs">
                    {t.vehicle?.obdOdometerMeters
                      ? `${(t.vehicle.obdOdometerMeters.value / 1000).toLocaleString(undefined, { maximumFractionDigits: 0 })} km`
                      : connected
                      ? "not linked"
                      : "—"}
                  </td>
                  <td className="px-5 py-2.5 text-xs text-[var(--ink-muted)]">
                    {t.matchedVia === "assignment" ? "driver assignment" : t.matchedVia === "name" ? "vehicle name" : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      )}

      {connected && (vehicles.length > 0 || assignments.length > 0) && (
        <p className="text-xs text-[var(--ink-muted)] mt-4">
          Trucks link automatically via their most recent driver&apos;s current Samsara
          assignment — set each driver&apos;s Samsara driver ID in{" "}
          <a href="/administration" className="underline">
            Administration → Driver master
          </a>
          . If a driver has no active assignment right now, it falls back to matching the
          truck&apos;s Samsara vehicle name (also set in Administration, under Truck master).
        </p>
      )}
    </div>
  );
}
