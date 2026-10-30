"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import DateRangeFilter, { DateRange, computePreset } from "@/components/DateRangeFilter";
import ExportButton from "@/components/ExportButton";

type DayStat = { ptoCount: number; ptoMs: number; boomCount: number; boomMs: number; drivers: string[] };
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

// The trucks KW Towing wants to follow by default (matched on "KW 23", "WRT 10" etc. in the Samsara name).
const MY_TRUCKS = new Set(["kw23", "kw10", "kw11", "kw13", "kw15", "kw19", "kw36", "kw24", "kw17", "kw28", "wrt10", "wrt7", "wrt11", "wrt6"]);
const truckKey = (name: string) => {
  const m = name.match(/^(kw|wrt)\s*0*(\d+)/i);
  return m ? `${m[1].toLowerCase()}${m[2]}` : "";
};
const STORE_KEY = "kw-pto-trucks";
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
  const [noData, setNoData] = useState<{ vehicleId: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[] | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
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
          setNoData(j.noData ?? []);
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

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORE_KEY);
      if (saved) setPicked(JSON.parse(saved));
    } catch {}
  }, []);
  const choose = (ids: string[] | null) => {
    setPicked(ids);
    setOpen(null);
    try {
      if (ids) localStorage.setItem(STORE_KEY, JSON.stringify(ids));
      else localStorage.removeItem(STORE_KEY);
    } catch {}
  };

  const allTrucks = useMemo(
    () =>
      [...trucks.map((t) => ({ vehicleId: t.vehicleId, name: t.name })), ...noData].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { numeric: true })
      ),
    [trucks, noData]
  );
  const effective = useMemo(
    () => new Set(picked ?? allTrucks.filter((t) => MY_TRUCKS.has(truckKey(t.name))).map((t) => t.vehicleId)),
    [picked, allTrucks]
  );
  const selected = trucks.filter((t) => effective.has(t.vehicleId));
  const selectedNoData = noData.filter((t) => effective.has(t.vehicleId));
  const allSelected = effective.size === allTrucks.length;

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
          <div className="relative">
            <button
              onClick={() => setPickerOpen((v) => !v)}
              className="bg-[var(--surface)] border border-[var(--line)] rounded-full px-3 py-1.5 text-sm"
            >
              {allSelected ? "All trucks" : `${effective.size} trucks selected`} ▾
            </button>
            {pickerOpen && (
              <div className="absolute z-20 mt-2 w-72 card p-3 shadow-lg max-h-96 overflow-y-auto">
                <div className="flex flex-wrap gap-2 mb-2 text-xs">
                  <button className="underline" onClick={() => choose(null)}>My 14 trucks</button>
                  <button className="underline" onClick={() => choose(allTrucks.map((t) => t.vehicleId))}>All</button>
                  <button className="underline" onClick={() => choose([])}>None</button>
                  <button className="underline ml-auto" onClick={() => setPickerOpen(false)}>Close</button>
                </div>
                {allTrucks.map((t) => {
                  const noSignal = noData.some((n) => n.vehicleId === t.vehicleId);
                  return (
                    <label key={t.vehicleId} className="flex items-center gap-2 py-1 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={effective.has(t.vehicleId)}
                        onChange={(e) => {
                          const next = new Set(effective);
                          if (e.target.checked) next.add(t.vehicleId);
                          else next.delete(t.vehicleId);
                          choose([...next]);
                        }}
                      />
                      <span>{t.name}</span>
                      {noSignal && <span className="text-[10px] text-[var(--ink-muted)] ml-auto">no data</span>}
                    </label>
                  );
                })}
              </div>
            )}
          </div>
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
                  Driver: r.s.drivers.join(", "),
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
              { l: "Trucks selected", v: String(effective.size), sub: `${selected.filter((t) => t.sessions > 0).length} used PTO${selectedNoData.length ? ` · ${selectedNoData.length} no data` : ""}` },
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
              <div className="font-display italic text-lg">Day by day{allSelected ? "" : ` — ${selected.length} selected truck${selected.length === 1 ? "" : "s"}`}</div>
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
                      <th className="px-5 py-2 font-normal">Driver</th>
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
                            <td className="px-5 py-2.5">{r.s.drivers.length ? r.s.drivers.join(", ") : <span className="text-[var(--ink-muted)] text-xs">not signed in</span>}</td>
                            <td className="px-5 py-2.5 font-mono-num">{r.truck.tracksPto ? `${r.s.ptoCount}×` : <span className="text-[var(--ink-muted)]">n/a</span>}</td>
                            <td className="px-5 py-2.5 font-mono-num">{r.truck.tracksPto ? dur(r.s.ptoMs) : "—"}</td>
                            <td className="px-5 py-2.5 font-mono-num">{r.truck.tracksBoom ? `${r.s.boomCount}×` : <span className="text-[var(--ink-muted)]">n/a</span>}</td>
                            <td className="px-5 py-2.5 font-mono-num">{r.truck.tracksBoom ? dur(r.s.boomMs) : "—"}</td>
                          </tr>
                          {isOpen && (
                            <tr className="bg-[var(--bg)]">
                              <td colSpan={7} className="px-5 py-3">
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

          {selectedNoData.length > 0 && (
            <div className="card px-5 py-4">
              <div className="text-sm font-medium">No PTO data from Samsara for {selectedNoData.length} selected truck{selectedNoData.length === 1 ? "" : "s"}</div>
              <div className="text-xs text-[var(--ink-muted)] mt-1">
                Samsara&apos;s data feed gives no PTO or boom readings for these trucks, even where the Samsara screen shows PTO. They can&apos;t be reported until Samsara exposes them.
              </div>
              <div className="flex flex-wrap gap-2 mt-3">
                {selectedNoData.map((t) => (
                  <span key={t.vehicleId} className="text-xs rounded-full border border-[var(--line)] bg-[var(--bg)] px-2.5 py-1">{t.name}</span>
                ))}
              </div>
            </div>
          )}

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
              {!allSelected && (
                <div className="px-5 py-3 text-xs text-[var(--ink-muted)] border-t border-[var(--line)]">Driver table covers all trucks with data, not just the selected ones.</div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
