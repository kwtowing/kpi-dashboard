"use client";

import { useEffect, useState, useCallback } from "react";
import DateRangeFilter, { DateRange } from "@/components/DateRangeFilter";
import ExportButton from "@/components/ExportButton";

type Driver = { driver_id: string; driver_name: string | null };

type Summary = {
  calls: number;
  revenue: number;
  km_paid: number;
  avg_revenue_per_call: number;
  zero_paid_calls: number;
  trucks_used: number;
  hours: number;
  hourly_rate: number | null;
  labour_cost: number | null;
};

type Call = {
  id: number;
  call_no: string;
  receive_date: string;
  truck: string | null;
  garage: string | null;
  trouble_cd: string | null;
  call_status: string | null;
  om_mileage: number | null;
  towed_kms_paid: number | null;
  towed_kms: number | null;
  total_cost: number | null;
};

function fmt(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export default function DriverPerformanceExplorer() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [driverId, setDriverId] = useState("");
  const [range, setRange] = useState<DateRange>({ from: null, to: null });
  const [truck, setTruck] = useState("");
  const [troubleCd, setTroubleCd] = useState("");
  const [payment, setPayment] = useState("all");
  const [truckOptions, setTruckOptions] = useState<string[]>([]);
  const [troubleOptions, setTroubleOptions] = useState<string[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [driverName, setDriverName] = useState<string | null>(null);
  const [calls, setCalls] = useState<Call[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/drivers")
      .then((r) => r.json())
      .then((j) => setDrivers(j.drivers ?? []));
  }, []);

  useEffect(() => {
    if (!driverId) {
      setTruckOptions([]);
      setTroubleOptions([]);
      return;
    }
    fetch(`/api/driver-filter-options?driver_id=${driverId}`)
      .then((r) => r.json())
      .then((j) => {
        setTruckOptions(j.trucks ?? []);
        setTroubleOptions(j.troubleCodes ?? []);
      });
    setTruck("");
    setTroubleCd("");
  }, [driverId]);

  const load = useCallback(async () => {
    if (!driverId) return;
    setLoading(true);
    const params = new URLSearchParams({ driver_id: driverId, payment });
    if (range.from && range.to) {
      params.set("from", range.from);
      params.set("to", range.to);
    }
    if (truck) params.set("truck", truck);
    if (troubleCd) params.set("trouble_cd", troubleCd);

    const res = await fetch(`/api/driver-performance?${params.toString()}`);
    const json = await res.json();
    setSummary(json.summary ?? null);
    setDriverName(json.driver_name ?? null);
    setCalls(json.calls ?? []);
    setLoading(false);
  }, [driverId, range, truck, troubleCd, payment]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-4 border-b border-[var(--line)]">
        <div className="font-display italic text-lg">Driver performance explorer</div>
        <div className="text-xs text-[var(--ink-muted)]">
          Pick a driver, a date range, and any combination of filters
        </div>
      </div>

      <div className="px-5 py-4 border-b border-[var(--line)] flex flex-wrap gap-2">
        <select
          value={driverId}
          onChange={(e) => setDriverId(e.target.value)}
          className="border border-[var(--line)] rounded-lg px-3 py-1.5 text-sm bg-[var(--surface)]"
        >
          <option value="">Select a driver…</option>
          {drivers.map((d) => (
            <option key={d.driver_id} value={d.driver_id}>
              {d.driver_name || d.driver_id}
            </option>
          ))}
        </select>

        <DateRangeFilter onChange={setRange} />

        <select
          value={truck}
          onChange={(e) => setTruck(e.target.value)}
          disabled={!driverId}
          className="border border-[var(--line)] rounded-lg px-3 py-1.5 text-sm bg-[var(--surface)] disabled:opacity-50"
        >
          <option value="">All trucks</option>
          {truckOptions.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        <select
          value={troubleCd}
          onChange={(e) => setTroubleCd(e.target.value)}
          disabled={!driverId}
          className="border border-[var(--line)] rounded-lg px-3 py-1.5 text-sm bg-[var(--surface)] disabled:opacity-50"
        >
          <option value="">All service codes</option>
          {troubleOptions.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        <select
          value={payment}
          onChange={(e) => setPayment(e.target.value)}
          disabled={!driverId}
          className="border border-[var(--line)] rounded-lg px-3 py-1.5 text-sm bg-[var(--surface)] disabled:opacity-50"
        >
          <option value="all">All payments</option>
          <option value="paid">Paid only</option>
          <option value="zero">Zero-paid only</option>
        </select>
      </div>

      {!driverId ? (
        <div className="px-5 py-10 text-sm text-[var(--ink-muted)] text-center">
          Select a driver above to see their performance.
        </div>
      ) : loading ? (
        <div className="px-5 py-10 text-sm text-[var(--ink-muted)] text-center">Loading…</div>
      ) : (
        <div>
          <div className="px-5 py-4 border-b border-[var(--line)]">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-medium">{driverName || driverId}</div>
              <ExportButton
                filename={`KW-Towing-${driverName || driverId}-Performance`}
                sheets={[
                  {
                    name: "Summary",
                    rows: summary
                      ? [
                          { Metric: "Driver", Value: driverName || driverId },
                          { Metric: "Calls", Value: summary.calls },
                          { Metric: "Revenue (CAD)", Value: summary.revenue },
                          { Metric: "KM paid", Value: summary.km_paid },
                          { Metric: "Avg revenue/call (CAD)", Value: summary.avg_revenue_per_call },
                          { Metric: "Zero-paid calls", Value: summary.zero_paid_calls },
                          { Metric: "Trucks used", Value: summary.trucks_used },
                          { Metric: "Hours (est.)", Value: summary.hours },
                          { Metric: "Hourly rate (CAD)", Value: summary.hourly_rate ?? "not set" },
                          { Metric: "Labour cost (CAD)", Value: summary.labour_cost ?? "not set" },
                          { Metric: "Date range", Value: range.from && range.to ? `${range.from} to ${range.to}` : "All time" },
                          { Metric: "Truck filter", Value: truck || "All trucks" },
                          { Metric: "Service code filter", Value: troubleCd || "All codes" },
                          { Metric: "Payment filter", Value: payment },
                        ]
                      : [],
                  },
                  {
                    name: "Calls",
                    rows: calls.map((c) => ({
                      Date: c.receive_date,
                      "Call #": c.call_no,
                      Truck: c.truck ?? "",
                      Garage: c.garage ?? "",
                      "Trouble code": c.trouble_cd ?? "",
                      "KM paid": c.towed_kms_paid ?? "",
                      "KM towed": c.towed_kms ?? "",
                      "Total cost (CAD)": c.total_cost ?? "",
                    })),
                  },
                ]}
              />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Metric label="Calls" value={summary?.calls ?? 0} />
              <Metric label="Revenue (CAD)" value={`$${fmt(summary?.revenue ?? 0)}`} tone="revenue" />
              <Metric label="KM paid" value={fmt(summary?.km_paid ?? 0)} />
              <Metric label="Avg / call" value={`$${fmt(summary?.avg_revenue_per_call ?? 0)}`} />
              <Metric label="Zero-paid" value={summary?.zero_paid_calls ?? 0} tone={summary?.zero_paid_calls ? "cost" : undefined} />
              <Metric label="Trucks used" value={summary?.trucks_used ?? 0} />
              <Metric label="Hours (est.)" value={summary?.hours ?? 0} />
              <Metric
                label="Labour cost"
                value={summary?.labour_cost !== null && summary?.labour_cost !== undefined ? `$${fmt(summary.labour_cost)}` : "no rate set"}
                tone="cost"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[var(--ink-muted)] text-xs border-b border-[var(--line)]">
                  <th className="px-5 py-2 font-normal">Date</th>
                  <th className="px-5 py-2 font-normal">Call #</th>
                  <th className="px-5 py-2 font-normal">Truck</th>
                  <th className="px-5 py-2 font-normal">Garage</th>
                  <th className="px-5 py-2 font-normal">Code</th>
                  <th className="px-5 py-2 font-normal">KM paid</th>
                  <th className="px-5 py-2 font-normal">Total cost</th>
                </tr>
              </thead>
              <tbody>
                {calls.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-8 text-center text-sm text-[var(--ink-muted)]">
                      No calls match these filters.
                    </td>
                  </tr>
                ) : (
                  calls.map((c) => (
                    <tr key={c.id} className="border-t border-[var(--line)]">
                      <td className="px-5 py-2.5 font-mono-num text-xs">{c.receive_date}</td>
                      <td className="px-5 py-2.5 font-mono-num">{c.call_no}</td>
                      <td className="px-5 py-2.5">{c.truck ?? "—"}</td>
                      <td className="px-5 py-2.5">{c.garage ?? "—"}</td>
                      <td className="px-5 py-2.5 font-mono-num text-xs">{c.trouble_cd ?? "—"}</td>
                      <td className="px-5 py-2.5 font-mono-num">{c.towed_kms_paid ?? "—"}</td>
                      <td
                        className="px-5 py-2.5 font-mono-num"
                        style={{ color: c.total_cost === 0 ? "var(--cost)" : "var(--revenue)" }}
                      >
                        {c.total_cost !== null ? `$${fmt(c.total_cost)}` : "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string | number; tone?: "revenue" | "cost" }) {
  const color = tone === "revenue" ? "var(--revenue)" : tone === "cost" ? "var(--cost)" : "var(--ink)";
  return (
    <div>
      <div className="text-[11px] text-[var(--ink-muted)] mb-0.5">{label}</div>
      <div className="font-mono-num text-sm font-medium" style={{ color }}>
        {value}
      </div>
    </div>
  );
}
