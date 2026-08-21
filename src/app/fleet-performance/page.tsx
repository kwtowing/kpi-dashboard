"use client";

import { useEffect, useState, useCallback } from "react";

type SamsaraVehicle = {
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
  engineStates?: { value: string; time: string };
  fuelPercents?: { value: number; time: string };
};

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  return `${Math.round(hours / 24)} day(s) ago`;
}

export default function FleetPerformancePage() {
  const [vehicles, setVehicles] = useState<SamsaraVehicle[]>([]);
  const [connected, setConnected] = useState(true);
  const [reason, setReason] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/samsara/vehicles");
    const json = await res.json();
    setVehicles(json.vehicles ?? []);
    setConnected(json.connected);
    setReason(json.reason ?? null);
    setError(json.error ?? null);
    setSyncedAt(json.syncedAt ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const operating = vehicles.filter((v) => v.engineStates?.value === "On").length;
  const idling = vehicles.filter((v) => v.engineStates?.value === "Idle").length;
  const parked = vehicles.filter((v) => v.engineStates?.value === "Off").length;
  const unknownState = vehicles.length - operating - idling - parked;
  const fuelReadings = vehicles.filter((v) => v.fuelPercents?.value !== undefined);
  const avgFuel =
    fuelReadings.length > 0
      ? fuelReadings.reduce((sum, v) => sum + (v.fuelPercents?.value ?? 0), 0) / fuelReadings.length
      : null;

  return (
    <div className="px-4 sm:px-8 py-6 sm:py-8 max-w-6xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
        <div>
          <h1 className="font-display italic text-3xl">Fleet Performance</h1>
          <p className="text-sm text-[var(--ink-muted)] mt-1">
            Live from Samsara — pulled fresh from the API on every page load, nothing cached.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="px-4 py-2 rounded-full border border-[var(--line)] text-sm bg-[var(--surface)] disabled:opacity-50 shrink-0"
        >
          {loading ? "Refreshing…" : "Refresh now"}
        </button>
      </div>

      {/* Live status banner */}
      <div
        className="rounded-2xl border px-5 py-3.5 mb-6 flex items-center gap-3 flex-wrap"
        style={{
          background: connected ? "var(--revenue-soft)" : reason === "not_configured" ? "var(--accent-soft)" : "var(--cost-soft)",
          borderColor: connected ? "var(--revenue)" : reason === "not_configured" ? "var(--accent)" : "var(--cost)",
        }}
      >
        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={{ background: connected ? "var(--revenue)" : reason === "not_configured" ? "var(--accent)" : "var(--cost)" }}
        />
        {connected ? (
          <div className="text-sm">
            <span className="font-medium" style={{ color: "var(--revenue)" }}>
              Samsara Connected
            </span>
            <span className="text-[var(--ink-muted)]">
              {" "}
              — {vehicles.length} vehicle{vehicles.length === 1 ? "" : "s"} · last sync {syncedAt ? timeAgo(syncedAt) : "just now"}
            </span>
          </div>
        ) : reason === "not_configured" ? (
          <div className="text-sm">
            <span className="font-medium">Samsara isn&apos;t connected yet</span>
            <span className="text-[var(--ink-muted)]">
              {" "}
              — add SAMSARA_API_TOKEN in Vercel → Settings → Environment Variables, then redeploy
            </span>
          </div>
        ) : (
          <div className="text-sm">
            <span className="font-medium" style={{ color: "var(--cost)" }}>
              Samsara Connection Issue
            </span>
            <span className="text-[var(--ink-muted)] font-mono-num"> — {error}</span>
          </div>
        )}
      </div>

      {connected && !loading && vehicles.length > 0 && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
            <StatCard label="Total vehicles" value={vehicles.length} />
            <StatCard label="Operating" value={operating} tone="revenue" />
            <StatCard label="Idling" value={idling} tone="cost" />
            <StatCard label="Parked" value={parked} />
            <StatCard label="Avg. fuel" value={avgFuel !== null ? `${Math.round(avgFuel)}%` : "—"} />
          </div>

          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-[var(--line)]">
              <div className="font-display italic text-lg">Vehicle status</div>
              <div className="text-xs text-[var(--ink-muted)]">Every vehicle currently in Samsara, live</div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[var(--ink-muted)] text-xs border-b border-[var(--line)]">
                    <th className="px-5 py-2 font-normal">Vehicle</th>
                    <th className="px-5 py-2 font-normal">Engine</th>
                    <th className="px-5 py-2 font-normal">Fuel</th>
                    <th className="px-5 py-2 font-normal">Speed</th>
                    <th className="px-5 py-2 font-normal">Location</th>
                    <th className="px-5 py-2 font-normal">Odometer</th>
                    <th className="px-5 py-2 font-normal">GPS updated</th>
                  </tr>
                </thead>
                <tbody>
                  {vehicles.map((v) => (
                    <tr key={v.id} className="border-t border-[var(--line)]">
                      <td className="px-5 py-2.5 font-medium">{v.name}</td>
                      <td className="px-5 py-2.5">
                        {v.engineStates?.value ? (
                          <span
                            className="text-xs px-2 py-0.5 rounded-full"
                            style={{
                              background:
                                v.engineStates.value === "On"
                                  ? "var(--revenue-soft)"
                                  : v.engineStates.value === "Idle"
                                  ? "var(--cost-soft)"
                                  : "var(--bg)",
                              color:
                                v.engineStates.value === "On"
                                  ? "var(--revenue)"
                                  : v.engineStates.value === "Idle"
                                  ? "var(--cost)"
                                  : "var(--ink-muted)",
                            }}
                          >
                            {v.engineStates.value}
                          </span>
                        ) : (
                          <span className="text-xs text-[var(--ink-muted)]">—</span>
                        )}
                      </td>
                      <td className="px-5 py-2.5 font-mono-num text-xs">
                        {v.fuelPercents?.value !== undefined ? `${v.fuelPercents.value}%` : "—"}
                      </td>
                      <td className="px-5 py-2.5 font-mono-num text-xs">
                        {v.gps?.speedMilesPerHour !== undefined ? `${Math.round(v.gps.speedMilesPerHour * 1.60934)} km/h` : "—"}
                      </td>
                      <td className="px-5 py-2.5 text-xs">
                        {v.gps?.reverseGeo?.formattedLocation ??
                          (v.gps ? `${v.gps.latitude.toFixed(3)}, ${v.gps.longitude.toFixed(3)}` : "—")}
                      </td>
                      <td className="px-5 py-2.5 font-mono-num text-xs">
                        {v.obdOdometerMeters
                          ? `${(v.obdOdometerMeters.value / 1000).toLocaleString(undefined, { maximumFractionDigits: 0 })} km`
                          : "—"}
                      </td>
                      <td className="px-5 py-2.5 text-xs text-[var(--ink-muted)]">
                        {v.gps?.time ? timeAgo(v.gps.time) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {connected && !loading && vehicles.length === 0 && (
        <div className="card px-5 py-10 text-sm text-[var(--ink-muted)] text-center">
          Connected to Samsara, but no vehicles were returned — check that vehicles exist in
          your Samsara organization and the token has vehicle-read access.
        </div>
      )}

      <p className="text-xs text-[var(--ink-muted)] mt-6">
        Engine hours, idle duration history, and fuel cost totals need Samsara&apos;s trip-history
        endpoints rather than a live snapshot — that&apos;s a further build once this connection
        is confirmed working end to end.
      </p>
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: string | number; tone?: "revenue" | "cost" }) {
  const color = tone === "revenue" ? "var(--revenue)" : tone === "cost" ? "var(--cost)" : "var(--ink)";
  return (
    <div className="card px-4 py-3.5">
      <div className="text-xs text-[var(--ink-muted)] mb-1.5">{label}</div>
      <div className="font-mono-num text-xl font-medium" style={{ color }}>
        {value}
      </div>
    </div>
  );
}
