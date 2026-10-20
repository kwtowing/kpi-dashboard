"use client";

import { useEffect, useMemo, useState } from "react";

type DriverWeek = { driverId: string; name: string | null; km: number[]; calls: number[] };
type Response = { latestWeekStart: string | null; drivers: DriverWeek[] };

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const km = (v: number) => Math.round(v).toLocaleString();

function weekStartMs(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function fmtWeek(ms: number) {
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}

function Change({ latest, avg }: { latest: number; avg: number }) {
  if (avg === 0 && latest === 0) return <span className="text-[var(--ink-muted)]">–</span>;
  if (avg === 0) return <span style={{ color: "var(--revenue)" }}>new</span>;
  const diff = latest - avg;
  const pct = (diff / avg) * 100;
  const up = diff >= 0;
  return (
    <span style={{ color: up ? "var(--revenue)" : "var(--cost)" }}>
      {up ? "▲" : "▼"} {km(Math.abs(diff))} km ({up ? "+" : "-"}
      {Math.abs(pct).toFixed(0)}%)
    </span>
  );
}

export default function DriverWeeklyKm() {
  const [data, setData] = useState<Response | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/driver-weekly-km")
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        if (!Array.isArray(j.drivers)) throw new Error("bad response");
        setData(j);
      })
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, []);

  const view = useMemo(() => {
    if (!data || !data.latestWeekStart) return null;
    const start = weekStartMs(data.latestWeekStart);
    const weeks = [0, 1, 2, 3].map((i) => start - i * WEEK_MS);
    const inProgress = start + WEEK_MS > Date.now();
    const behind = !inProgress && Date.now() - (start + WEEK_MS) > 0;

    const rows = data.drivers
      .map((d) => {
        const prior = d.km.slice(1);
        const avg = prior.reduce((a, b) => a + b, 0) / 3;
        return { ...d, avg, latest: d.km[0] };
      })
      .sort((a, b) => b.latest - a.latest || b.avg - a.avg);

    const totals = [0, 1, 2, 3].map((i) => rows.reduce((a, r) => a + r.km[i], 0));
    const totalAvg = (totals[1] + totals[2] + totals[3]) / 3;
    return { weeks, inProgress, behind, rows, totals, totalAvg };
  }, [data]);

  return (
    <div className="card p-5">
      <div className="mb-4">
        <div className="font-display italic text-lg">Driver KMs per week</div>
        <div className="text-xs text-[var(--ink-muted)]">
          KM paid per driver, latest week vs. the 3 weeks before it (weeks start Monday)
          {view?.inProgress ? " — latest week is still in progress" : ""}
        </div>
      </div>

      {error ? (
        <div className="text-sm text-[var(--ink-muted)] py-10 text-center">Could not load weekly KMs.</div>
      ) : !data ? (
        <div className="text-sm text-[var(--ink-muted)] py-10 text-center">Loading…</div>
      ) : !view || view.rows.length === 0 ? (
        <div className="text-sm text-[var(--ink-muted)] py-10 text-center">No driver calls recorded yet.</div>
      ) : (
        <>
          {view.behind && (
            <div className="mb-3 text-xs text-[var(--ink-muted)]">
              Latest CAA data on file is for the week of {fmtWeek(view.weeks[0])}.
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-[var(--ink-muted)] border-b border-[var(--line)]">
                  <th className="px-3 py-2 font-normal text-left">Driver</th>
                  <th className="px-3 py-2 font-normal text-right">
                    Wk of {fmtWeek(view.weeks[0])}
                    <div className="text-[10px]">{view.inProgress ? "latest · so far" : "latest"}</div>
                  </th>
                  {view.weeks.slice(1).map((w) => (
                    <th key={w} className="px-3 py-2 font-normal text-right">
                      Wk of {fmtWeek(w)}
                    </th>
                  ))}
                  <th className="px-3 py-2 font-normal text-right">
                    3-wk avg
                    <div className="text-[10px]">prior weeks</div>
                  </th>
                  <th className="px-3 py-2 font-normal text-right">Latest vs avg</th>
                </tr>
              </thead>
              <tbody>
                {view.rows.map((r) => (
                  <tr key={r.driverId} className="border-b border-[var(--line)] last:border-0">
                    <td className="px-3 py-2.5 font-medium">
                      {r.name ?? r.driverId}
                      {r.name && <span className="ml-2 text-[11px] text-[var(--ink-muted)] font-normal">{r.driverId}</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono-num font-medium">{km(r.km[0])}</td>
                    {[1, 2, 3].map((i) => (
                      <td key={i} className="px-3 py-2.5 text-right font-mono-num text-[var(--ink-muted)]">
                        {km(r.km[i])}
                      </td>
                    ))}
                    <td className="px-3 py-2.5 text-right font-mono-num">{km(r.avg)}</td>
                    <td className="px-3 py-2.5 text-right font-mono-num">
                      <Change latest={r.latest} avg={r.avg} />
                    </td>
                  </tr>
                ))}
                <tr className="border-t border-[var(--line)] font-medium">
                  <td className="px-3 py-2.5">All drivers</td>
                  <td className="px-3 py-2.5 text-right font-mono-num">{km(view.totals[0])}</td>
                  {[1, 2, 3].map((i) => (
                    <td key={i} className="px-3 py-2.5 text-right font-mono-num">
                      {km(view.totals[i])}
                    </td>
                  ))}
                  <td className="px-3 py-2.5 text-right font-mono-num">{km(view.totalAvg)}</td>
                  <td className="px-3 py-2.5 text-right font-mono-num">
                    <Change latest={view.totals[0]} avg={view.totalAvg} />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
