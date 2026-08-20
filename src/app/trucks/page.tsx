"use client";

import { useEffect, useState } from "react";

type TruckRow = {
  truck: string;
  call_count: number;
  km_paid: number;
  total_cost: number;
  last_used: string;
};

type SamsaraVehicle = {
  id: string;
  name: string;
  gps?: { latitude: number; longitude: number; time: string; reverseGeo?: { formattedLocation?: string } };
  obdOdometerMeters?: { value: number; time: string };
};

function normalize(s: string) {
  return s.trim().toLowerCase();
}

export default function TrucksPage() {
  const [trucks, setTrucks] = useState<TruckRow[]>([]);
  const [vehicles, setVehicles] = useState<SamsaraVehicle[]>([]);
  const [connected, setConnected] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/truck-report").then((r) => r.json()),
      fetch("/api/samsara/vehicles").then((r) => r.json()),
    ]).then(([truckRes, samsaraRes]) => {
      setTrucks(truckRes.rows ?? []);
      setVehicles(samsaraRes.vehicles ?? []);
      setConnected(samsaraRes.connected);
      setLoading(false);
    });
  }, []);

  const matched = trucks.map((t) => {
    const vehicle = vehicles.find((v) => normalize(v.name) === normalize(t.truck));
    return { ...t, vehicle };
  });

  return (
    <div className="px-8 py-8 max-w-5xl">
      <h1 className="font-display italic text-3xl mb-1">Trucks on the CAA project</h1>
      <p className="text-sm text-[var(--ink-muted)] mb-8">
        Usage and revenue from CAA calls, matched with live location and odometer from Samsara.
      </p>

      {!connected && (
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

      {loading ? (
        <div className="text-sm text-[var(--ink-muted)]">Loading…</div>
      ) : trucks.length === 0 ? (
        <div className="card px-5 py-10 text-sm text-[var(--ink-muted)] text-center">
          No truck data yet — import a CAA report to see trucks used.
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[var(--ink-muted)] text-xs border-b border-[var(--line)]">
                <th className="px-5 py-2 font-normal">Truck</th>
                <th className="px-5 py-2 font-normal">Calls</th>
                <th className="px-5 py-2 font-normal">KM paid</th>
                <th className="px-5 py-2 font-normal">Total cost</th>
                <th className="px-5 py-2 font-normal">Last used</th>
                <th className="px-5 py-2 font-normal">Samsara location</th>
                <th className="px-5 py-2 font-normal">Odometer</th>
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {connected && vehicles.length > 0 && (
        <p className="text-xs text-[var(--ink-muted)] mt-4">
          Matching is by name — a truck shows as &quot;not linked&quot; if its code in the CAA
          report (e.g. &quot;WL2&quot;) doesn&apos;t exactly match a vehicle name in Samsara.
          Rename the vehicle in Samsara to match and it&apos;ll link automatically.
        </p>
      )}
    </div>
  );
}
