"use client";

import { useEffect, useMemo, useState } from "react";

type Category = { category: string; amount: number; driverLinked: boolean };
type DriverRow = { driverId: string; name: string | null; cost: number; calls: number; revenue: number; kmPaid: number };
type TruckRow = { truck: string | null; cost: number; calls: number; drivers: number; revenue: number; kmPaid: number };
type Response = { categories: Category[]; drivers: DriverRow[]; trucks: TruckRow[] };

type Tab = "category" | "driver" | "truck";

const money = (v: number) => `${v < 0 ? "-" : ""}$${Math.abs(Math.round(v)).toLocaleString()}`;
const km = (v: number) => Math.round(v).toLocaleString();
const perKm = (cost: number, kms: number) => (kms > 0 ? `$${(cost / kms).toFixed(2)}` : "–");

const TABS: { value: Tab; label: string }[] = [
  { value: "category", label: "By category" },
  { value: "driver", label: "By driver" },
  { value: "truck", label: "By truck" },
];

export default function CostBreakdown({
  period,
  range,
}: {
  period: string;
  range: { from: string | null; to: string | null };
}) {
  const [tab, setTab] = useState<Tab>("category");
  const [data, setData] = useState<Response | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(false);
    let url = `/api/cost-breakdown?period=${period}`;
    if (range.from && range.to) url += `&from=${range.from}&to=${range.to}`;
    fetch(url)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        if (!Array.isArray(j.categories)) throw new Error("bad response");
        setData(j);
      })
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, [period, range.from, range.to]);

  const totals = useMemo(() => {
    const cats = data?.categories ?? [];
    const total = cats.reduce((a, c) => a + c.amount, 0);
    const driverLinked = cats.filter((c) => c.driverLinked).reduce((a, c) => a + c.amount, 0);
    return { total, driverLinked, company: total - driverLinked };
  }, [data]);

  const scopeLabel = range.from && range.to ? `${range.from} to ${range.to}` : `current ${period}`;

  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <div className="font-display italic text-lg">Cost breakdown</div>
          <div className="text-xs text-[var(--ink-muted)]">Every cost, by category, driver and truck — {scopeLabel}</div>
        </div>
        <div className="inline-flex bg-[var(--surface)] border border-[var(--line)] rounded-full p-1">
          {TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              className={`px-3.5 py-1 rounded-full text-sm transition-colors ${
                tab === t.value ? "bg-[var(--ink)] text-white" : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <div className="text-sm text-[var(--ink-muted)] py-10 text-center">Could not load the cost breakdown.</div>
      ) : !data ? (
        <div className="text-sm text-[var(--ink-muted)] py-10 text-center">Loading…</div>
      ) : data.categories.length === 0 ? (
        <div className="text-sm text-[var(--ink-muted)] py-10 text-center">No cost entries yet for this period.</div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3 mb-5">
            <Stat label="Total cost" value={money(totals.total)} />
            <Stat label="Driver labour" value={money(totals.driverLinked)} />
            <Stat label="Other company costs" value={money(totals.company)} />
          </div>

          {tab === "category" && <CategoryList categories={data.categories} total={totals.total} />}
          {tab === "driver" && <DriverTable rows={data.drivers} />}
          {tab === "truck" && <TruckTable rows={data.trucks} companyCosts={totals.company} />}
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--line)] px-4 py-3">
      <div className="text-[11px] text-[var(--ink-muted)]">{label}</div>
      <div className="font-mono-num text-lg" style={{ color: "var(--cost)" }}>
        {value}
      </div>
    </div>
  );
}

function CategoryList({ categories, total }: { categories: Category[]; total: number }) {
  const max = Math.max(...categories.map((c) => c.amount), 1);
  return (
    <div className="space-y-3">
      {categories.map((c) => (
        <div key={c.category}>
          <div className="flex items-baseline justify-between gap-3 mb-1 text-sm">
            <span>
              {c.category}
              <span className="ml-2 text-[11px] text-[var(--ink-muted)]">
                {c.driverLinked ? "tied to drivers & trucks" : "company-level"}
              </span>
            </span>
            <span className="font-mono-num text-xs text-[var(--ink-muted)]">
              {money(c.amount)} · {total > 0 ? ((c.amount / total) * 100).toFixed(1) : "0.0"}%
            </span>
          </div>
          <div className="h-2 rounded-full" style={{ background: "var(--cost-soft)" }}>
            <div
              className="h-2 rounded-full"
              style={{ width: `${(Math.max(c.amount, 0) / max) * 100}%`, background: "var(--cost)", minWidth: c.amount > 0 ? "2px" : 0 }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <th className={`px-3 py-2 font-normal ${right ? "text-right" : "text-left"}`}>{children}</th>;
}

function Td({ children, right, strong }: { children: React.ReactNode; right?: boolean; strong?: boolean }) {
  return (
    <td className={`px-3 py-2.5 ${right ? "text-right font-mono-num" : ""} ${strong ? "font-medium" : ""}`}>{children}</td>
  );
}

function Net({ value }: { value: number }) {
  return <span style={{ color: value >= 0 ? "var(--revenue)" : "var(--cost)" }}>{money(value)}</span>;
}

function DriverTable({ rows }: { rows: DriverRow[] }) {
  if (rows.length === 0) {
    return <div className="text-sm text-[var(--ink-muted)] py-8 text-center">No driver costs in this period.</div>;
  }
  const sum = (f: (r: DriverRow) => number) => rows.reduce((a, r) => a + f(r), 0);
  const totalCost = sum((r) => r.cost);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-[var(--ink-muted)] border-b border-[var(--line)]">
            <Th>Driver</Th>
            <Th right>Labour cost</Th>
            <Th right>Share</Th>
            <Th right>Calls</Th>
            <Th right>KM paid</Th>
            <Th right>Cost / km</Th>
            <Th right>Revenue</Th>
            <Th right>After labour</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.driverId} className="border-b border-[var(--line)] last:border-0">
              <Td strong>
                {r.name ?? r.driverId}
                {r.name && <span className="ml-2 text-[11px] text-[var(--ink-muted)]">{r.driverId}</span>}
              </Td>
              <Td right>{money(r.cost)}</Td>
              <Td right>{totalCost > 0 ? `${((r.cost / totalCost) * 100).toFixed(1)}%` : "–"}</Td>
              <Td right>{r.calls.toLocaleString()}</Td>
              <Td right>{km(r.kmPaid)}</Td>
              <Td right>{perKm(r.cost, r.kmPaid)}</Td>
              <Td right>{money(r.revenue)}</Td>
              <Td right>
                <Net value={r.revenue - r.cost} />
              </Td>
            </tr>
          ))}
          <tr className="border-t border-[var(--line)] font-medium">
            <Td>All drivers</Td>
            <Td right>{money(totalCost)}</Td>
            <Td right>100%</Td>
            <Td right>{sum((r) => r.calls).toLocaleString()}</Td>
            <Td right>{km(sum((r) => r.kmPaid))}</Td>
            <Td right>{perKm(totalCost, sum((r) => r.kmPaid))}</Td>
            <Td right>{money(sum((r) => r.revenue))}</Td>
            <Td right>
              <Net value={sum((r) => r.revenue) - totalCost} />
            </Td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function TruckTable({ rows, companyCosts }: { rows: TruckRow[]; companyCosts: number }) {
  if (rows.length === 0) {
    return <div className="text-sm text-[var(--ink-muted)] py-8 text-center">No truck activity in this period.</div>;
  }
  const sum = (f: (r: TruckRow) => number) => rows.reduce((a, r) => a + f(r), 0);
  const totalCost = sum((r) => r.cost);
  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-[var(--ink-muted)] border-b border-[var(--line)]">
              <Th>Truck</Th>
              <Th right>Labour cost</Th>
              <Th right>Share</Th>
              <Th right>Calls</Th>
              <Th right>Drivers</Th>
              <Th right>KM paid</Th>
              <Th right>Cost / km</Th>
              <Th right>Revenue</Th>
              <Th right>After labour</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.truck ?? "none"} className="border-b border-[var(--line)] last:border-0">
                <Td strong>{r.truck ?? "No truck recorded"}</Td>
                <Td right>{money(r.cost)}</Td>
                <Td right>{totalCost > 0 ? `${((r.cost / totalCost) * 100).toFixed(1)}%` : "–"}</Td>
                <Td right>{r.calls.toLocaleString()}</Td>
                <Td right>{r.drivers}</Td>
                <Td right>{km(r.kmPaid)}</Td>
                <Td right>{perKm(r.cost, r.kmPaid)}</Td>
                <Td right>{money(r.revenue)}</Td>
                <Td right>
                  <Net value={r.revenue - r.cost} />
                </Td>
              </tr>
            ))}
            <tr className="border-t border-[var(--line)] font-medium">
              <Td>All trucks</Td>
              <Td right>{money(totalCost)}</Td>
              <Td right>100%</Td>
              <Td right>{sum((r) => r.calls).toLocaleString()}</Td>
              <Td right>–</Td>
              <Td right>{km(sum((r) => r.kmPaid))}</Td>
              <Td right>{perKm(totalCost, sum((r) => r.kmPaid))}</Td>
              <Td right>{money(sum((r) => r.revenue))}</Td>
              <Td right>
                <Net value={sum((r) => r.revenue) - totalCost} />
              </Td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-[var(--ink-muted)]">
        Truck cost is the driver labour for calls run in that truck (salaried drivers are split across the trucks they
        used that day). {companyCosts > 0 ? `${money(companyCosts)} of other costs is recorded at company level, not per truck.` : ""}
      </p>
    </>
  );
}
