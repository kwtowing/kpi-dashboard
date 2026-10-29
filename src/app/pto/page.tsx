"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import DateRangeFilter, { DateRange, computePreset } from "@/components/DateRangeFilter";
import ExportButton from "@/components/ExportButton";

type DayStat = { ptoCount: number; ptoMs: number; boomCount: number; boomMs: number };
type Truck = {
  vehicleId: string;
  name: string;
  tracksPto: boolean;
  tracksBoom: boolean;
  ptoHours: number;
  boomHours: number;
  sessions: number;
  boomSessions: number;
  longestPtoMin: number;
  days: Record<string, DayStat>;
  ptoSessions: [number, number][];
  boomSessionList: [number, number][];
};
type Driver = { driverId: string; name: string; ptoHours: number; boomHours: number };

const TZ = "America/Toronto";
const dayOf = (ms: number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
const clock = (ms: number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TZ, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(new Date(ms));
const hrs = (n: number) => `${n.toFixed(1)} h`;
function dur(ms: number) {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, "0")}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}
const weekday = (d: string) => new Date(d + "T12:00:00").toLocaleDateString(undefined, { weekday: "short" });

type Row = { day: string; truck: Truck; s: DayStat };

export default function PtoPage() {
  const [range, setRange] = useState<DateRange>(() => computePreset("this_week"));
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [truckFilter, setTruckFilter] = useState("all");
  const [open, setOpen] = useState<string | null>(null);

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

  const names = useMemo(() => [...trucks].sort((a, b) => a.name.localeCompare(b.name)), [trucks]);
  const selected = trucks.filter((t) => truckFilter === "all" || t.vehicleId === truckFilter);

  const rows: Row[] = useMemo(() => {
    const out: Row[] = [];
    for (const t of selected) for (const [day, s] of Object.entries(t.days)) out.push({ day, truck: t, s });
    out.sort((a, b) => (a.day === b.day ? a.truck.name.localeCompare(b.truck.name) : b.day.localeCompare(a.day)));
    return out;
  }, [selected]);

  const totalPto = selected.reduce((a, t) => a + t.ptoHours, 0);
  const totalBoom = selected.reduce((a, t) => a + t.boomHours, 0);
  const totalCount = selected.reduce((a, t) => a + t.sessions, 0);
  const totalBoomCount = selected.reduce((a, t) => a + t.boomSessions, 0);

  const sessionsFor = (r: Row) => {
    const mk = (list: [number, number][], kind: string) =>
      list.filter(([s]) => dayOf(s) === r.day).map(([s, e]) => ({ kind, s, e }));
    return [...mk(r.truck.ptoSessions, "PTO"), ...mk(r.truck.boomSessionList, "Boom")].sort((a, b) => a.s - b.s);
  };

  return (
    <div className="px-4 sm:px-8 py-6 sm:py-8 max-w-6xl">
      <div className="mb-4">
        <h1 className="font-display italic text-3xl">PTO &amp; boom usage</h1>
        <p className="text-sm text-[var(--ink-muted)] mt-1">
          Every truck on the company&apos;s Samsara account — how many times the power take-off (winch / wheel-lift drive) and boom were switched on each day, and for how long.
        </p>
      </div>

      <div className="card p-4 sm:p-5 mb-6 flex flex-wrap items-end gap-x-6 gap-y-3">
        <div>
          <div className="text-xs text-[var(--ink-muted)] mb-1.5">Date range (max 31 days)</div>
          <DateRangeFilter onChange={setRange} initialPreset="this_week" />
        </div>
        <div>
          <div className="text-xs text-[var(--ink-muted)] mb-1.5">Truck</div>
          <select
            value={truckFilter}
            onChange={(e) => {
              setTruckFilter(e.target.value);
              setOpen(null);
            }}
            className="bg-[var(--surface)] border border-[var(--line)] rounded-full px-3 py-1.5 text-sm"
          >
            <option value="all">All trucks</option>
            {names.map((t) => (
              <option key={t.vehicleId} value={t.vehicleId}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <div className="ml-auto pb-0.5">
          <ExportButton
            filename="KW-Towing-PTO-Usage"
            sheets={[
              {
                name: "Per day",
                rows: rows.map((r) => ({
                  Date: r.day,
                  Truck: r.truck.name,
                  "PTO times on": r.s.ptoCount,
                  "PTO total (min)": Math.round(r.s.ptoMs / 600) / 100,
                  "Boom times on": r.s.boomCount,
                  "Boom total (min)": Math.round(r.s.boomMs / 600) / 100,
                })),
              },
              {
                name: "Every switch-on",
                rows: rows.flatMap((r) =>
                  sessionsFor(r).map((x) => ({
                    Date: r.day,
                    Truck: r.truck.name,
                    Type: x.kind,
                    "Switched on": clock(x.s),
                    "Switched off": clock(x.e),
                    "Duration (min)": Math.round((x.e - x.s) / 600) / 100,
                  }))
                ),
              },
              {
                name: "By truck",
                rows: selected.map((t) => ({
                  Truck: t.name,
                  "PTO times on": t.sessions,
                  "PTO hours": Math.round(t.ptoHours * 100) / 100,
                  "Boom times on": t.boomSessions,
                  "Boom hours": Math.round(t.boomHours * 100) / 100,
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
              { l: "PTO switched on", v: `${totalCount}×`, sub: `${hrs(totalPto)} in total` },
              { l: "Boom switched on", v: `${totalBoomCount}×`, sub: `${hrs(totalBoom)} in total` },
              { l: "Avg PTO per switch-on", v: totalCount ? dur((totalPto * 3_600_000) / totalCount) : "—", sub: "length of one use" },
              { l: truckFilter === "all" ? "Trucks reporting" : "Truck", v: truckFilter === "all" ? String(trucks.length) : selected[0]?.name ?? "—", sub: truckFilter === "all" ? `${trucks.filter((t) => t.sessions > 0).length} used PTO` : "" },
            ].map((k) => (
              <div key={k.l} className="card px-4 py-3">
                <div className="text-xs text-[var(--ink-muted)]">{k.l}</div>
                <div className="font-mono-num text-xl mt-0.5 truncate">{k.v}</div>
                <div className="text-xs text-[var(--ink-muted)] mt-0.5">{k.sub || " "}</div>
              </div>
            ))}
          </div>

          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-[var(--line)]">
              <div className="font-display italic text-lg">Day by day{truckFilter === "all" ? "" : ` — ${selected[0]?.name ?? ""}`}</div>
              <div className="text-xs text-[var(--ink-muted)]">
                Times switched on and total time on, per truck per day (Toronto time). Click a row to see each switch-on.
              </div>
            </div>
            {rows.length === 0 ? (
              <div className="px-5 py-10 text-sm text-[var(--ink-muted)] text-center">No PTO or boom activity for these filters.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[var(--ink-muted)] text-xs border-b border-[var(--line)]">
                      <th className="px-5 py-2 font-normal">Date</th>
                      <th className="px-5 py-2 font-normal">Truck</th>
                      <th className="px-5 py-2 font-normal">PTO switched on</th>
                      <th className="px-5 py-2 font-normal">PTO total time</th>
                      <th className="px-5 py-2 font-normal">Boom switched on</th>
                      <th className="px-5 py-2 font-normal">Boom total time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const key = `${r.day}|${r.truck.vehicleId}`;
                      const isOpen = open === key;
                      return (
                        <Fragment key={key}>
                          <tr className="border-t border-[var(--line)] cursor-pointer hover:bg-[var(--bg)]" onClick={() => setOpen(isOpen ? null : key)}>
                            <td className="px-5 py-2.5 font-mono-num text-xs">
                              <span className="text-[var(--ink-muted)] mr-1">{isOpen ? "▾" : "▸"}</span>
                              {weekday(r.day)} {r.day}
                            </td>
                            <td className="px-5 py-2.5">{r.truck.name}</td>
                            <td className="px-5 py-2.5 font-mono-num">{r.truck.tracksPto ? `${r.s.ptoCount}×` : <span className="text-[var(--ink-muted)]">n/a</span>}</td>
                            <td className="px-5 py-2.5 font-mono-num">{r.truck.tracksPto ? dur(r.s.ptoMs) : "—"}</td>
                            <td className="px-5 py-2.5 font-mono-num">{r.truck.tracksBoom ? `${r.s.boomCount}×` : <span className="text-[var(--ink-muted)]">n/a</span>}</td>
                            <td className="px-5 py-2.5 font-mono-num">{r.truck.tracksBoom ? dur(r.s.boomMs) : "—"}</td>
                          </tr>
                          {isOpen && (
                            <tr className="bg-[var(--bg)]">
                              <td colSpan={6} className="px-5 py-3">
                                <div className="flex flex-wrap gap-2">
                                  {sessionsFor(r).map((x, i) => (
                                    <span key={i} className="text-xs font-mono-num rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1">
                                      <b style={{ color: x.kind === "PTO" ? "var(--accent)" : "var(--revenue)" }}>{x.kind}</b> {clock(x.s)} → {clock(x.e)} · {dur(x.e - x.s)}
                                    </span>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="card overflow-hidden">
              <div className="px-5 py-4 border-b border-[var(--line)]">
                <div className="font-display italic text-lg">By truck</div>
                <div className="text-xs text-[var(--ink-muted)]">Whole range</div>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[var(--ink-muted)] text-xs border-b border-[var(--line)]">
                    <th className="px-5 py-2 font-normal">Truck</th>
                    <th className="px-5 py-2 font-normal">PTO</th>
                    <th className="px-5 py-2 font-normal">Boom</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.map((t) => (
                    <tr key={t.vehicleId} className="border-t border-[var(--line)]">
                      <td className="px-5 py-2.5">{t.name}</td>
                      <td className="px-5 py-2.5 font-mono-num">{t.tracksPto ? `${t.sessions}× · ${hrs(t.ptoHours)}` : <span className="text-[var(--ink-muted)]">not tracked</span>}</td>
                      <td className="px-5 py-2.5 font-mono-num">{t.tracksBoom ? `${t.boomSessions}× · ${hrs(t.boomHours)}` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

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
                    <tr><td className="px-5 py-6 text-center text-[var(--ink-muted)]" colSpan={3}>No activity in this range.</td></tr>
                  )}
                </tbody>
              </table>
              {truckFilter !== "all" && (
                <div className="px-5 py-3 text-xs text-[var(--ink-muted)] border-t border-[var(--line)]">Driver table covers all trucks, not just the selected one.</div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
