"use client";

import { useEffect, useMemo, useState } from "react";
import DateRangeFilter, { DateRange, computePreset } from "@/components/DateRangeFilter";
import ExportButton from "@/components/ExportButton";

type Truck = {
  vehicleId: string;
  name: string;
  truckCode: string | null;
  tracksPto: boolean;
  tracksBoom: boolean;
  ptoHours: number;
  boomHours: number;
  sessions: number;
  longestPtoMin: number;
  noCallHours: number | null;
  callMatching: boolean;
  days: Record<string, number>;
};
type Driver = { driverId: string; name: string; ptoHours: number; boomHours: number };

const hrs = (n: number) => `${n.toFixed(1)} h`;

// A truck is flagged when PTO ran for a meaningful time with no call open.
const NO_CALL_MIN_HOURS = 0.5;
const NO_CALL_MIN_SHARE = 0.25;

export default function PtoPage() {
  const [range, setRange] = useState<DateRange>(() => computePreset("this_week"));
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [flaggedOnly, setFlaggedOnly] = useState(false);

  useEffect(() => {
    if (!range.from || !range.to) {
      setLoading(false);
      setError("Choose a date range (up to 31 days).");
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/pto?from=${range.from}&to=${range.to}`)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        if (j.error) {
          setError(j.error);
          setTrucks([]);
          setDrivers([]);
        } else {
          setTrucks(j.trucks ?? []);
          setDrivers(j.drivers ?? []);
        }
        setLoading(false);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(String(e));
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [range]);

  const days = useMemo(() => {
    const set = new Set<string>();
    trucks.forEach((t) => Object.keys(t.days).forEach((d) => set.add(d)));
    return [...set].sort();
  }, [trucks]);

  const flagFor = (t: Truck) =>
    t.noCallHours !== null && t.noCallHours >= NO_CALL_MIN_HOURS && t.ptoHours > 0 && t.noCallHours / t.ptoHours >= NO_CALL_MIN_SHARE;

  const shown = trucks.filter((t) => !flaggedOnly || flagFor(t));
  const totalPto = trucks.reduce((a, t) => a + t.ptoHours, 0);
  const totalBoom = trucks.reduce((a, t) => a + t.boomHours, 0);
  const flagged = trucks.filter(flagFor).length;
  const unmatched = trucks.filter((t) => !t.callMatching && t.ptoHours > 0).length;

  return (
    <div className="px-4 sm:px-8 py-6 sm:py-8 max-w-6xl">
      <div className="mb-4">
        <h1 className="font-display italic text-3xl">PTO &amp; boom usage</h1>
        <p className="text-sm text-[var(--ink-muted)] mt-1">
          How long each truck&apos;s power take-off (winch / wheel-lift drive) and boom were engaged, straight from Samsara.
        </p>
      </div>

      <div className="card p-4 sm:p-5 mb-6 flex flex-wrap items-end gap-x-6 gap-y-3">
        <div>
          <div className="text-xs text-[var(--ink-muted)] mb-1.5">Date range (max 31 days)</div>
          <DateRangeFilter onChange={setRange} initialPreset="this_week" />
        </div>
        <label className="flex items-center gap-2 text-sm pb-1.5 cursor-pointer">
          <input type="checkbox" checked={flaggedOnly} onChange={(e) => setFlaggedOnly(e.target.checked)} />
          Flagged trucks only
        </label>
        <div className="ml-auto pb-0.5">
          <ExportButton
            filename="KW-Towing-PTO-Usage"
            sheets={[
              {
                name: "By truck",
                rows: shown.map((t) => ({
                  Truck: t.name,
                  "PTO hours": Math.round(t.ptoHours * 100) / 100,
                  "Boom hours": Math.round(t.boomHours * 100) / 100,
                  "PTO sessions": t.sessions,
                  "Longest PTO (min)": Math.round(t.longestPtoMin),
                  "PTO hours with no call": t.noCallHours === null ? "not matched" : Math.round(t.noCallHours * 100) / 100,
                  Flag: flagFor(t) ? "Check" : "",
                })),
              },
              {
                name: "By driver",
                rows: drivers.map((d) => ({
                  Driver: d.name,
                  "PTO hours": Math.round(d.ptoHours * 100) / 100,
                  "Boom hours": Math.round(d.boomHours * 100) / 100,
                })),
              },
              {
                name: "PTO hours by day",
                rows: trucks.map((t) => {
                  const r: Record<string, string | number> = { Truck: t.name };
                  days.forEach((d) => (r[d] = Math.round(((t.days[d] ?? 0) / 3_600_000) * 100) / 100));
                  return r;
                }),
              },
            ]}
          />
        </div>
      </div>

      {error && <div className="card px-5 py-4 text-sm mb-6" style={{ color: "var(--cost)" }}>{error}</div>}
      {loading ? (
        <div className="text-sm text-[var(--ink-muted)]">Loading from Samsara…</div>
      ) : !error ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { l: "PTO engaged", v: hrs(totalPto), sub: `${trucks.filter((t) => t.ptoHours > 0).length} trucks used PTO` },
              { l: "Boom engaged", v: hrs(totalBoom), sub: `${trucks.filter((t) => t.boomHours > 0).length} trucks used boom` },
              { l: "Avg PTO per truck", v: trucks.length ? hrs(totalPto / trucks.length) : "—", sub: `${trucks.length} trucks reporting` },
              { l: "Trucks to check", v: String(flagged), sub: "PTO running with no call open" },
            ].map((k) => (
              <div key={k.l} className="card px-4 py-3">
                <div className="text-xs text-[var(--ink-muted)]">{k.l}</div>
                <div className="font-mono-num text-xl mt-0.5">{k.v}</div>
                <div className="text-xs text-[var(--ink-muted)] mt-0.5">{k.sub}</div>
              </div>
            ))}
          </div>

          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-[var(--line)]">
              <div className="font-display italic text-lg">By truck</div>
              <div className="text-xs text-[var(--ink-muted)]">
                &ldquo;No call open&rdquo; = PTO hours outside any CAA call window (15 min either side). Flagged when at least 30 min and 25% of PTO time.
              </div>
            </div>
            {shown.length === 0 ? (
              <div className="px-5 py-10 text-sm text-[var(--ink-muted)] text-center">No trucks to show for these filters.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[var(--ink-muted)] text-xs border-b border-[var(--line)]">
                      <th className="px-5 py-2 font-normal">Truck</th>
                      <th className="px-5 py-2 font-normal">PTO</th>
                      <th className="px-5 py-2 font-normal">Boom</th>
                      <th className="px-5 py-2 font-normal">PTO sessions</th>
                      <th className="px-5 py-2 font-normal">Longest PTO</th>
                      <th className="px-5 py-2 font-normal">PTO, no call open</th>
                      <th className="px-5 py-2 font-normal">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((t) => {
                      const f = flagFor(t);
                      return (
                        <tr key={t.vehicleId} className="border-t border-[var(--line)]">
                          <td className="px-5 py-2.5">{t.name}</td>
                          <td className="px-5 py-2.5 font-mono-num">{t.tracksPto ? hrs(t.ptoHours) : <span className="text-[var(--ink-muted)]">not tracked</span>}</td>
                          <td className="px-5 py-2.5 font-mono-num">{t.tracksBoom ? hrs(t.boomHours) : "—"}</td>
                          <td className="px-5 py-2.5 font-mono-num">{t.sessions}</td>
                          <td className="px-5 py-2.5 font-mono-num">{t.longestPtoMin ? `${Math.round(t.longestPtoMin)} min` : "—"}</td>
                          <td className="px-5 py-2.5 font-mono-num">
                            {t.noCallHours === null ? <span className="text-[var(--ink-muted)] text-xs">truck not linked to CAA code</span> : hrs(t.noCallHours)}
                          </td>
                          <td className="px-5 py-2.5">
                            {f ? (
                              <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--cost-soft)", color: "var(--cost)" }}>⚑ Check</span>
                            ) : (
                              <span className="text-xs text-[var(--ink-muted)]">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {unmatched > 0 && (
              <div className="px-5 py-3 text-xs text-[var(--ink-muted)] border-t border-[var(--line)]">
                {unmatched} truck{unmatched === 1 ? "" : "s"} can&apos;t be matched to calls yet. Set each truck&apos;s Samsara name in Administration → Trucks to enable the &ldquo;no call open&rdquo; check.
              </div>
            )}
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="card overflow-hidden">
              <div className="px-5 py-4 border-b border-[var(--line)]">
                <div className="font-display italic text-lg">By driver</div>
                <div className="text-xs text-[var(--ink-muted)]">Based on who was signed in to the truck in Samsara</div>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[var(--ink-muted)] text-xs border-b border-[var(--line)]">
                    <th className="px-5 py-2 font-normal">Driver</th>
                    <th className="px-5 py-2 font-normal">PTO</th>
                    <th className="px-5 py-2 font-normal">Boom</th>
                  </tr>
                </thead>
                <tbody>
                  {drivers.map((d) => (
                    <tr key={d.driverId} className="border-t border-[var(--line)]">
                      <td className="px-5 py-2.5">{d.name}</td>
                      <td className="px-5 py-2.5 font-mono-num">{hrs(d.ptoHours)}</td>
                      <td className="px-5 py-2.5 font-mono-num">{hrs(d.boomHours)}</td>
                    </tr>
                  ))}
                  {drivers.length === 0 && (
                    <tr><td className="px-5 py-6 text-center text-[var(--ink-muted)]" colSpan={3}>No PTO activity in this range.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="card overflow-hidden">
              <div className="px-5 py-4 border-b border-[var(--line)]">
                <div className="font-display italic text-lg">PTO hours by day</div>
                <div className="text-xs text-[var(--ink-muted)]">Fleet total per day (Toronto time)</div>
              </div>
              <table className="w-full text-sm">
                <tbody>
                  {days.map((d) => {
                    const total = trucks.reduce((a, t) => a + (t.days[d] ?? 0), 0) / 3_600_000;
                    const max = Math.max(...days.map((x) => trucks.reduce((a, t) => a + (t.days[x] ?? 0), 0) / 3_600_000), 1);
                    return (
                      <tr key={d} className="border-t border-[var(--line)]">
                        <td className="px-5 py-2 font-mono-num text-xs text-[var(--ink-muted)] w-28">{d}</td>
                        <td className="px-2 py-2">
                          <div className="h-2.5 rounded-full brand-gradient" style={{ width: `${(total / max) * 100}%`, minWidth: total > 0 ? 4 : 0 }} />
                        </td>
                        <td className="px-5 py-2 font-mono-num text-right">{hrs(total)}</td>
                      </tr>
                    );
                  })}
                  {days.length === 0 && (
                    <tr><td className="px-5 py-6 text-center text-[var(--ink-muted)]">No PTO activity in this range.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
