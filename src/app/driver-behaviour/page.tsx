"use client";

import { useEffect, useState, useCallback } from "react";
import DateRangeFilter, { DateRange } from "@/components/DateRangeFilter";
import ExportButton from "@/components/ExportButton";

type Event = {
  id: string;
  time: string;
  driverId: string | null;
  internalDriverId: string | null;
  internalDriverName: string | null;
  vehicleName: string | null;
  behaviorLabels: string[];
  speedMph: number | null;
  postedSpeedMph: number | null;
  location: string | null;
};

const HIGH_SEVERITY_LABELS = ["Speeding", "Harsh Braking", "Harsh Accel", "Harsh Turn", "Crash"];

function isHighSeverity(labels: string[]) {
  return labels.some((l) => HIGH_SEVERITY_LABELS.some((h) => l.toLowerCase().includes(h.toLowerCase())));
}

function toKmh(mph: number | null) {
  return mph !== null ? Math.round(mph * 1.60934) : null;
}

export default function DriverBehaviourPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [summary, setSummary] = useState<{ total: number; byLabel: Record<string, number>; byDriver: Record<string, { name: string; count: number }> } | null>(null);
  const [connected, setConnected] = useState(true);
  const [reason, setReason] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<DateRange>({ from: null, to: null });

  const load = useCallback(async (r: DateRange) => {
    setLoading(true);
    const suffix = r.from && r.to ? `?from=${r.from}&to=${r.to}` : "";
    const res = await fetch(`/api/samsara/safety-events${suffix}`);
    const json = await res.json();
    setEvents(json.events ?? []);
    setSummary(json.summary ?? null);
    setConnected(json.connected);
    setReason(json.reason ?? null);
    setError(json.error ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    load(range);
  }, [range, load]);

  const driverRanking = summary ? Object.values(summary.byDriver).sort((a, b) => b.count - a.count) : [];

  return (
    <div className="px-4 sm:px-8 py-6 sm:py-8 max-w-5xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
        <div>
          <h1 className="font-display italic text-3xl">Driver Behaviour</h1>
          <p className="text-sm text-[var(--ink-muted)] mt-1">
            Live safety events from Samsara — speeding, harsh braking, harsh acceleration, harsh cornering.
          </p>
        </div>
        {connected && events.length > 0 && (
          <ExportButton
            filename="KW-Towing-Driver-Behaviour"
            sheets={[
              {
                name: "Events",
                rows: events.map((e) => ({
                  Time: new Date(e.time).toLocaleString(),
                  Driver: e.internalDriverName ?? "Unknown",
                  Vehicle: e.vehicleName ?? "",
                  "Event type": e.behaviorLabels.join(", "),
                  "Speed (km/h)": toKmh(e.speedMph) ?? "",
                  "Posted speed (km/h)": toKmh(e.postedSpeedMph) ?? "",
                  Location: e.location ?? "",
                })),
              },
            ]}
          />
        )}
      </div>

      <div className="mb-6">
        <DateRangeFilter onChange={setRange} />
      </div>

      {!connected && !error && (
        <div className="card px-5 py-4 mb-6" style={{ borderColor: "var(--accent)" }}>
          <div className="text-sm font-medium mb-1">Samsara isn&apos;t connected yet</div>
          <p className="text-xs text-[var(--ink-muted)] leading-relaxed">
            Add SAMSARA_API_TOKEN in Vercel under your project&apos;s{" "}
            <strong>Settings → Environment Variables</strong>, then redeploy.
          </p>
        </div>
      )}

      {error && (
        <div className="card px-5 py-4 mb-6" style={{ borderColor: "var(--cost)" }}>
          <div className="text-sm font-medium mb-1" style={{ color: "var(--cost)" }}>
            Samsara connection failed
          </div>
          <p className="text-xs text-[var(--ink-muted)] leading-relaxed font-mono-num">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="text-sm text-[var(--ink-muted)]">Loading…</div>
      ) : connected && summary ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="card px-4 py-3.5">
              <div className="text-xs text-[var(--ink-muted)] mb-1.5">Total events</div>
              <div className="font-mono-num text-xl font-medium">{summary.total}</div>
            </div>
            {Object.entries(summary.byLabel)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 3)
              .map(([label, count]) => (
                <div key={label} className="card px-4 py-3.5">
                  <div className="text-xs text-[var(--ink-muted)] mb-1.5">{label}</div>
                  <div className="font-mono-num text-xl font-medium" style={{ color: "var(--cost)" }}>
                    {count}
                  </div>
                </div>
              ))}
          </div>

          {driverRanking.length > 0 && (
            <div className="card overflow-hidden">
              <div className="px-5 py-4 border-b border-[var(--line)]">
                <div className="font-display italic text-lg">Events by driver</div>
                <div className="text-xs text-[var(--ink-muted)]">Most events first</div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[var(--ink-muted)] text-xs border-b border-[var(--line)]">
                      <th className="px-5 py-2 font-normal">Driver</th>
                      <th className="px-5 py-2 font-normal">Events</th>
                    </tr>
                  </thead>
                  <tbody>
                    {driverRanking.map((d, i) => (
                      <tr key={i} className="border-t border-[var(--line)]">
                        <td className="px-5 py-2.5">{d.name}</td>
                        <td className="px-5 py-2.5 font-mono-num">{d.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-[var(--line)]">
              <div className="font-display italic text-lg">Events</div>
              <div className="text-xs text-[var(--ink-muted)]">Most recent first</div>
            </div>
            {events.length === 0 ? (
              <div className="px-5 py-10 text-sm text-[var(--ink-muted)] text-center">
                No safety events in this period.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[var(--ink-muted)] text-xs border-b border-[var(--line)]">
                      <th className="px-5 py-2 font-normal">Time</th>
                      <th className="px-5 py-2 font-normal">Driver</th>
                      <th className="px-5 py-2 font-normal">Vehicle</th>
                      <th className="px-5 py-2 font-normal">Event</th>
                      <th className="px-5 py-2 font-normal">Speed</th>
                      <th className="px-5 py-2 font-normal">Location</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...events]
                      .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
                      .map((e) => {
                        const high = isHighSeverity(e.behaviorLabels);
                        return (
                          <tr key={e.id} className="border-t border-[var(--line)]">
                            <td className="px-5 py-2.5 text-xs text-[var(--ink-muted)]">{new Date(e.time).toLocaleString()}</td>
                            <td className="px-5 py-2.5">{e.internalDriverName ?? "Unknown"}</td>
                            <td className="px-5 py-2.5 text-xs">{e.vehicleName ?? "—"}</td>
                            <td className="px-5 py-2.5">
                              {e.behaviorLabels.map((label) => (
                                <span
                                  key={label}
                                  className="text-xs px-2 py-0.5 rounded-full mr-1"
                                  style={{
                                    background: high ? "var(--cost-soft)" : "var(--bg)",
                                    color: high ? "var(--cost)" : "var(--ink-muted)",
                                  }}
                                >
                                  {label}
                                </span>
                              ))}
                            </td>
                            <td className="px-5 py-2.5 font-mono-num text-xs">
                              {e.speedMph !== null
                                ? `${toKmh(e.speedMph)} km/h${e.postedSpeedMph !== null ? ` / ${toKmh(e.postedSpeedMph)} km/h limit` : ""}`
                                : "—"}
                            </td>
                            <td className="px-5 py-2.5 text-xs">{e.location ?? "—"}</td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : null}

      <p className="text-xs text-[var(--ink-muted)] mt-6">
        Only drivers with a Samsara driver ID set in{" "}
        <a href="/administration" className="underline">
          Administration
        </a>{" "}
        appear here by name — otherwise events show their raw Samsara driver ID. Configurable
        alert thresholds and email notifications are a separate, later build (the &quot;Alerts&quot;
        page).
      </p>
    </div>
  );
}
