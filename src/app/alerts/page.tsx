"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import DateRangeFilter, { DateRange } from "@/components/DateRangeFilter";
import ExportButton from "@/components/ExportButton";

const ALERT_TYPES = [
  "speeding",
  "stunt_driving",
  "excessive_idle",
  "harsh_braking",
  "harsh_acceleration",
  "harsh_cornering",
] as const;

const ALERT_TYPE_LABELS: Record<string, string> = {
  speeding: "Speeding",
  stunt_driving: "Stunt driving",
  excessive_idle: "Excessive idling",
  harsh_braking: "Harsh braking",
  harsh_acceleration: "Harsh acceleration",
  harsh_cornering: "Harsh cornering",
};

const SOURCE_LABELS: Record<string, string> = {
  driver: "Driver override",
  truck: "Truck override",
  global: "Global default",
  legal: "Legal minimum",
};

type AlertRow = {
  id: number;
  alert_type: string;
  truck_number: string | null;
  driver_id: string | null;
  driver_name: string | null;
  threshold_value: number | null;
  threshold_source: string;
  observed_value: number | null;
  severity: "normal" | "high";
  status: "open" | "resolved" | "acknowledged" | "dismissed";
  opened_at: string;
  resolved_at: string | null;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
  notes: string | null;
};

type Summary = {
  byTypeAndStatus: { alert_type: string; status: string; count: string }[];
  today: number;
  sevenDayAverage: number;
  openStuntDriving: number;
};

type DefaultRow = {
  id: number;
  alert_type: string;
  threshold_value: number | null;
  unit: string | null;
  grace_seconds: number;
  is_active: boolean;
};

type OverrideRow = {
  id: number;
  scope: "truck" | "driver";
  truck_number: string | null;
  driver_id: string | null;
  driver_name: string | null;
  alert_type: string;
  threshold_value: number | null;
  unit: string | null;
  is_active: boolean;
  effective_from: string;
  effective_to: string | null;
};

type RuleRow = {
  alert_type: string;
  recipient_emails: string[];
  throttle_minutes: number;
  is_active: boolean;
};

type Driver = { driver_id: string; driver_name: string | null };
type Truck = { truck_number: string };

function unitSuffix(unit: string | null) {
  if (unit === "km_h") return " km/h";
  if (unit === "minutes") return " min";
  return "";
}

// alert_history doesn't store a unit column directly — infer it from the
// alert type, since each type has a fixed unit (or none, for the on/off
// harsh_* types).
function unitForAlertType(alertType: string): string | null {
  if (alertType === "speeding" || alertType === "stunt_driving") return "km_h";
  if (alertType === "excessive_idle") return "minutes";
  return null;
}

export default function AlertsPage() {
  const [tab, setTab] = useState<"history" | "thresholds" | "rules">("history");
  const [tablesReady, setTablesReady] = useState<boolean | null>(null);

  const checkReady = useCallback(async () => {
    const json = await fetch("/api/alerts/thresholds").then((r) => r.json());
    setTablesReady(!(typeof json.error === "string" && json.error.includes("does not exist")));
  }, []);

  useEffect(() => {
    checkReady();
  }, [checkReady]);

  return (
    <div className="px-4 sm:px-8 py-6 sm:py-8 max-w-6xl">
      <h1 className="font-display italic text-3xl mb-1">Alerts</h1>
      <p className="text-sm text-[var(--ink-muted)] mb-6">
        Speeding, stunt driving (Ontario HTA s.172), excessive idling, and harsh braking/acceleration/cornering —
        evaluated from live Samsara telemetry, with configurable thresholds and email notifications.
      </p>

      {tablesReady === false ? (
        <AlertsSetupBanner onReady={() => setTablesReady(true)} />
      ) : tablesReady === null ? (
        <div className="text-sm text-[var(--ink-muted)]">Loading…</div>
      ) : (
        <>
          <div className="inline-flex bg-[var(--surface)] border border-[var(--line)] rounded-full p-1 mb-6">
            {(["history", "thresholds", "rules"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-1.5 rounded-full text-sm transition-colors capitalize ${
                  tab === t ? "bg-[var(--ink)] text-white" : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
                }`}
              >
                {t === "history" ? "Alert history" : t === "thresholds" ? "Thresholds" : "Notification rules"}
              </button>
            ))}
          </div>

          {tab === "history" && <HistoryTab />}
          {tab === "thresholds" && <ThresholdsTab />}
          {tab === "rules" && <RulesTab />}
        </>
      )}
    </div>
  );
}

function AlertsSetupBanner({ onReady }: { onReady: () => void }) {
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState("");

  async function runSetup() {
    setStatus("loading");
    try {
      const res = await fetch("/api/setup", { method: "POST" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "Setup failed");
      onReady();
    } catch (err: any) {
      setStatus("error");
      setError(err.message);
    }
  }

  return (
    <div className="card px-5 py-5 max-w-xl">
      <div className="text-sm font-medium mb-1.5">One step left for Alerts</div>
      <p className="text-xs text-[var(--ink-muted)] leading-relaxed mb-4">
        The rest of the app is already set up — Alerts just needs its own database tables created.
        This is safe to run any time and only needs to happen once.
      </p>
      <button
        onClick={runSetup}
        disabled={status === "loading"}
        className="px-4 py-2 rounded-full bg-[var(--ink)] text-white text-sm disabled:opacity-50"
      >
        {status === "loading" ? "Setting up…" : "Set up alert tables"}
      </button>
      {status === "error" && (
        <div className="mt-3 text-xs" style={{ color: "var(--cost)" }}>
          {error}
        </div>
      )}
    </div>
  );
}

function RunEvaluationButton() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function run() {
    setRunning(true);
    setResult(null);
    try {
      const res = await fetch("/api/alerts/evaluate", { method: "POST" });
      const json = await res.json();
      if (!json.ran) {
        setResult(json.reason === "not_configured" ? "Samsara isn't connected." : `Failed: ${json.reason}`);
      } else {
        setResult(
          `Checked ${json.trucksChecked} trucks, ${json.safetyEventsProcessed} safety events — ${json.alertsOpened} new alert(s), ${json.notificationsSent} email(s) sent.`
        );
      }
    } catch (err: any) {
      setResult(`Failed: ${err.message}`);
    }
    setRunning(false);
  }

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <button
        onClick={run}
        disabled={running}
        className="px-3 py-1.5 rounded-full border border-[var(--line)] text-xs bg-[var(--surface)] hover:bg-[var(--bg)] disabled:opacity-50"
      >
        {running ? "Running…" : "Run evaluation now"}
      </button>
      {result && <span className="text-xs text-[var(--ink-muted)]">{result}</span>}
    </div>
  );
}

function HistoryTab() {
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [range, setRange] = useState<DateRange>({ from: null, to: null });
  const [alertType, setAlertType] = useState("");
  const [truckNumber, setTruckNumber] = useState("");
  const [driverId, setDriverId] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (range.from) params.set("from", range.from);
    if (range.to) params.set("to", range.to);
    if (alertType) params.set("alert_type", alertType);
    if (truckNumber) params.set("truck_number", truckNumber);
    if (driverId) params.set("driver_id", driverId);
    if (status) params.set("status", status);

    const [h, d, t] = await Promise.all([
      fetch(`/api/alerts/history?${params.toString()}`).then((r) => r.json()),
      fetch("/api/drivers").then((r) => r.json()),
      fetch("/api/trucks-master").then((r) => r.json()),
    ]);
    setAlerts(h.alerts ?? []);
    setSummary(h.summary ?? null);
    setDrivers(d.drivers ?? []);
    setTrucks(t.trucks ?? []);
    setLoading(false);
  }, [range, alertType, truckNumber, driverId, status]);

  useEffect(() => {
    load();
  }, [load]);

  async function act(id: number, action: "acknowledge" | "dismiss" | "note", extra?: Record<string, any>) {
    await fetch("/api/alerts/history", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action, ...extra }),
    });
    load();
  }

  const byTypeStatus = summary?.byTypeAndStatus ?? [];
  const openByType = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of byTypeStatus) {
      if (r.status === "open") m[r.alert_type] = Number(r.count);
    }
    return m;
  }, [byTypeStatus]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <RunEvaluationButton />
        {alerts.length > 0 && (
          <ExportButton
            filename="KW-Towing-Alerts"
            sheets={[
              {
                name: "Alerts",
                rows: alerts.map((a) => ({
                  Time: new Date(a.opened_at).toLocaleString(),
                  Truck: a.truck_number ?? "",
                  Driver: a.driver_name ?? a.driver_id ?? "",
                  Type: ALERT_TYPE_LABELS[a.alert_type] ?? a.alert_type,
                  Observed: a.observed_value ?? "",
                  Threshold: a.threshold_value ?? "",
                  Source: SOURCE_LABELS[a.threshold_source] ?? a.threshold_source,
                  Severity: a.severity,
                  Status: a.status,
                  "Acknowledged by": a.acknowledged_by ?? "",
                })),
              },
            ]}
          />
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="card px-4 py-3.5">
          <div className="text-xs text-[var(--ink-muted)] mb-1.5">Alerts today</div>
          <div className="font-mono-num text-xl font-medium">{summary?.today ?? "—"}</div>
        </div>
        <div className="card px-4 py-3.5">
          <div className="text-xs text-[var(--ink-muted)] mb-1.5">7-day average</div>
          <div className="font-mono-num text-xl font-medium">{summary ? summary.sevenDayAverage.toFixed(1) : "—"}</div>
        </div>
        <div className="card px-4 py-3.5" style={{ borderColor: "var(--cost)" }}>
          <div className="text-xs text-[var(--ink-muted)] mb-1.5">Open stunt driving</div>
          <div className="font-mono-num text-xl font-medium" style={{ color: "var(--cost)" }}>
            {summary?.openStuntDriving ?? "—"}
          </div>
        </div>
        <div className="card px-4 py-3.5">
          <div className="text-xs text-[var(--ink-muted)] mb-1.5">Open (all types)</div>
          <div className="font-mono-num text-xl font-medium">
            {Object.values(openByType).reduce((a, b) => a + b, 0)}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <DateRangeFilter onChange={setRange} />
        <select
          value={alertType}
          onChange={(e) => setAlertType(e.target.value)}
          className="border border-[var(--line)] rounded-lg px-3 py-1.5 text-sm bg-[var(--surface)]"
        >
          <option value="">All types</option>
          {ALERT_TYPES.map((t) => (
            <option key={t} value={t}>
              {ALERT_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
        <select
          value={truckNumber}
          onChange={(e) => setTruckNumber(e.target.value)}
          className="border border-[var(--line)] rounded-lg px-3 py-1.5 text-sm bg-[var(--surface)]"
        >
          <option value="">All trucks</option>
          {trucks.map((t) => (
            <option key={t.truck_number} value={t.truck_number}>
              {t.truck_number}
            </option>
          ))}
        </select>
        <select
          value={driverId}
          onChange={(e) => setDriverId(e.target.value)}
          className="border border-[var(--line)] rounded-lg px-3 py-1.5 text-sm bg-[var(--surface)]"
        >
          <option value="">All drivers</option>
          {drivers.map((d) => (
            <option key={d.driver_id} value={d.driver_id}>
              {d.driver_name ?? d.driver_id}
            </option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="border border-[var(--line)] rounded-lg px-3 py-1.5 text-sm bg-[var(--surface)]"
        >
          <option value="">All statuses</option>
          <option value="open">Open</option>
          <option value="acknowledged">Acknowledged</option>
          <option value="resolved">Resolved</option>
          <option value="dismissed">Dismissed</option>
        </select>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="px-5 py-10 text-sm text-[var(--ink-muted)] text-center">Loading…</div>
        ) : alerts.length === 0 ? (
          <div className="px-5 py-10 text-sm text-[var(--ink-muted)] text-center">No alerts match these filters.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[var(--ink-muted)] text-xs border-b border-[var(--line)]">
                  <th className="px-5 py-2 font-normal">Time</th>
                  <th className="px-5 py-2 font-normal">Truck</th>
                  <th className="px-5 py-2 font-normal">Driver</th>
                  <th className="px-5 py-2 font-normal">Type</th>
                  <th className="px-5 py-2 font-normal">Observed / Threshold</th>
                  <th className="px-5 py-2 font-normal">Source</th>
                  <th className="px-5 py-2 font-normal">Status</th>
                  <th className="px-5 py-2 font-normal">Actions</th>
                </tr>
              </thead>
              <tbody>
                {alerts.map((a) => (
                  <AlertRowLine key={a.id} alert={a} onAct={act} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function AlertRowLine({ alert: a, onAct }: { alert: AlertRow; onAct: (id: number, action: "acknowledge" | "dismiss" | "note", extra?: Record<string, any>) => void }) {
  const high = a.severity === "high";
  return (
    <tr
      className="border-t border-[var(--line)]"
      style={high ? { background: "var(--cost-soft)" } : undefined}
    >
      <td className="px-5 py-2.5 text-xs text-[var(--ink-muted)] whitespace-nowrap">{new Date(a.opened_at).toLocaleString()}</td>
      <td className="px-5 py-2.5">{a.truck_number ?? "—"}</td>
      <td className="px-5 py-2.5">{a.driver_name ?? a.driver_id ?? "—"}</td>
      <td className="px-5 py-2.5">
        <span
          className="text-xs px-2 py-0.5 rounded-full"
          style={high ? { background: "var(--cost)", color: "white", fontWeight: 600 } : { background: "var(--bg)", color: "var(--ink-muted)" }}
        >
          {ALERT_TYPE_LABELS[a.alert_type] ?? a.alert_type}
          {high ? " · LEGAL" : ""}
        </span>
      </td>
      <td className="px-5 py-2.5 font-mono-num text-xs">
        {a.observed_value != null ? `${a.observed_value}${unitSuffix(unitForAlertType(a.alert_type))}` : "—"}
        {a.threshold_value != null ? ` / ${a.threshold_value}${unitSuffix(unitForAlertType(a.alert_type))}` : ""}
      </td>
      <td className="px-5 py-2.5 text-xs text-[var(--ink-muted)]">{SOURCE_LABELS[a.threshold_source] ?? a.threshold_source}</td>
      <td className="px-5 py-2.5 text-xs capitalize">
        {a.status}
        {a.acknowledged_by ? <div className="text-[var(--ink-muted)]">by {a.acknowledged_by}</div> : null}
        {a.notes ? <div className="text-[var(--ink-muted)] italic max-w-[160px] truncate" title={a.notes}>{a.notes}</div> : null}
      </td>
      <td className="px-5 py-2.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          {a.status === "open" && (
            <button
              onClick={() => {
                const name = window.prompt("Acknowledged by:");
                if (name) onAct(a.id, "acknowledge", { acknowledged_by: name });
              }}
              className="text-[11px] px-2 py-1 rounded-full bg-[var(--ink)] text-white"
            >
              Acknowledge
            </button>
          )}
          {(a.status === "open" || a.status === "acknowledged") && (
            <button
              onClick={() => onAct(a.id, "dismiss")}
              className="text-[11px] px-2 py-1 rounded-full border border-[var(--line)]"
            >
              Dismiss
            </button>
          )}
          <button
            onClick={() => {
              const note = window.prompt("Note:", a.notes ?? "");
              if (note !== null) onAct(a.id, "note", { notes: note });
            }}
            className="text-[11px] px-2 py-1 rounded-full border border-[var(--line)]"
          >
            Note
          </button>
        </div>
      </td>
    </tr>
  );
}

function ThresholdsTab() {
  const [defaults, setDefaults] = useState<DefaultRow[]>([]);
  const [overrides, setOverrides] = useState<OverrideRow[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [t, d, tr] = await Promise.all([
      fetch("/api/alerts/thresholds").then((r) => r.json()),
      fetch("/api/drivers").then((r) => r.json()),
      fetch("/api/trucks-master").then((r) => r.json()),
    ]);
    setDefaults(t.defaults ?? []);
    setOverrides(t.overrides ?? []);
    setDrivers(d.drivers ?? []);
    setTrucks(tr.trucks ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function saveDefault(row: DefaultRow) {
    await fetch("/api/alerts/thresholds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "default", ...row }),
    });
    load();
  }

  async function addOverride(o: Partial<OverrideRow>) {
    await fetch("/api/alerts/thresholds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "override", ...o }),
    });
    load();
  }

  async function removeOverride(id: number) {
    await fetch(`/api/alerts/thresholds?id=${id}`, { method: "DELETE" });
    load();
  }

  if (loading) return <div className="text-sm text-[var(--ink-muted)]">Loading…</div>;

  return (
    <div className="space-y-6">
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--line)]">
          <div className="font-display italic text-lg">Global defaults</div>
          <div className="text-xs text-[var(--ink-muted)]">
            Stunt driving is fixed by Ontario HTA s.172 (legal minimum) — shown read-only; add a stricter override below if needed.
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[var(--ink-muted)] text-xs border-b border-[var(--line)]">
                <th className="px-5 py-2 font-normal">Alert type</th>
                <th className="px-5 py-2 font-normal">Threshold</th>
                <th className="px-5 py-2 font-normal">Grace (sec)</th>
                <th className="px-5 py-2 font-normal">Active</th>
                <th className="px-5 py-2 font-normal"></th>
              </tr>
            </thead>
            <tbody>
              {defaults.map((d) => (
                <DefaultRowLine key={d.alert_type} row={d} onSave={saveDefault} />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--line)] flex items-center justify-between">
          <div>
            <div className="font-display italic text-lg">Overrides</div>
            <div className="text-xs text-[var(--ink-muted)]">What&apos;s currently beating the default, per truck or driver.</div>
          </div>
        </div>
        <AddOverrideForm drivers={drivers} trucks={trucks} onAdd={addOverride} />
        {overrides.length === 0 ? (
          <div className="px-5 py-8 text-sm text-[var(--ink-muted)] text-center">No overrides yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[var(--ink-muted)] text-xs border-b border-[var(--line)]">
                  <th className="px-5 py-2 font-normal">Scope</th>
                  <th className="px-5 py-2 font-normal">Target</th>
                  <th className="px-5 py-2 font-normal">Alert type</th>
                  <th className="px-5 py-2 font-normal">Value</th>
                  <th className="px-5 py-2 font-normal">Active</th>
                  <th className="px-5 py-2 font-normal">Effective</th>
                  <th className="px-5 py-2 font-normal"></th>
                </tr>
              </thead>
              <tbody>
                {overrides.map((o) => (
                  <tr key={o.id} className="border-t border-[var(--line)]">
                    <td className="px-5 py-2 capitalize">{o.scope}</td>
                    <td className="px-5 py-2">{o.scope === "truck" ? o.truck_number : o.driver_name ?? o.driver_id}</td>
                    <td className="px-5 py-2">{ALERT_TYPE_LABELS[o.alert_type] ?? o.alert_type}</td>
                    <td className="px-5 py-2 font-mono-num">{o.threshold_value ?? "on/off"}</td>
                    <td className="px-5 py-2 text-xs">{o.is_active ? "Active" : "Inactive"}</td>
                    <td className="px-5 py-2 text-xs text-[var(--ink-muted)]">
                      {new Date(o.effective_from).toLocaleDateString()}
                      {o.effective_to ? ` – ${new Date(o.effective_to).toLocaleDateString()}` : ""}
                    </td>
                    <td className="px-5 py-2">
                      <button onClick={() => removeOverride(o.id)} className="text-[11px] px-2 py-1 rounded-full border border-[var(--line)]">
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function DefaultRowLine({ row, onSave }: { row: DefaultRow; onSave: (r: DefaultRow) => void }) {
  const isLegal = row.alert_type === "stunt_driving";
  const isOnOff = row.unit === null && !isLegal;
  const [value, setValue] = useState(row.threshold_value?.toString() ?? "");
  const [grace, setGrace] = useState(row.grace_seconds.toString());
  const [active, setActive] = useState(row.is_active);
  const [dirty, setDirty] = useState(false);

  return (
    <tr className="border-t border-[var(--line)]">
      <td className="px-5 py-2">{ALERT_TYPE_LABELS[row.alert_type] ?? row.alert_type}</td>
      <td className="px-5 py-2 font-mono-num">
        {isLegal ? (
          <span className="text-xs text-[var(--ink-muted)]">40/50 km/h over (fixed by law)</span>
        ) : isOnOff ? (
          <span className="text-xs text-[var(--ink-muted)]">On/off — no numeric threshold</span>
        ) : (
          <>
            <input
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setDirty(true);
              }}
              className="w-16 bg-transparent border-b border-transparent focus:border-[var(--line)] outline-none text-sm font-mono-num text-right"
            />
            {unitSuffix(row.unit)}
          </>
        )}
      </td>
      <td className="px-5 py-2">
        {isLegal ? (
          "—"
        ) : (
          <input
            value={grace}
            onChange={(e) => {
              setGrace(e.target.value);
              setDirty(true);
            }}
            className="w-14 bg-transparent border-b border-transparent focus:border-[var(--line)] outline-none text-sm font-mono-num text-right"
          />
        )}
      </td>
      <td className="px-5 py-2">
        <input
          type="checkbox"
          checked={active}
          disabled={isLegal}
          onChange={(e) => {
            setActive(e.target.checked);
            setDirty(true);
          }}
        />
      </td>
      <td className="px-5 py-2">
        {!isLegal && dirty && (
          <button
            onClick={() => {
              onSave({ ...row, threshold_value: value ? Number(value) : null, grace_seconds: Number(grace) || 0, is_active: active });
              setDirty(false);
            }}
            className="text-xs px-3 py-1 rounded-full bg-[var(--ink)] text-white"
          >
            Save
          </button>
        )}
      </td>
    </tr>
  );
}

function AddOverrideForm({ drivers, trucks, onAdd }: { drivers: Driver[]; trucks: Truck[]; onAdd: (o: Partial<OverrideRow>) => void }) {
  const [scope, setScope] = useState<"truck" | "driver">("truck");
  const [target, setTarget] = useState("");
  const [alertType, setAlertType] = useState<string>(ALERT_TYPES[0]);
  const [value, setValue] = useState("");
  const [effectiveTo, setEffectiveTo] = useState("");

  const isOnOff = alertType === "harsh_braking" || alertType === "harsh_acceleration" || alertType === "harsh_cornering";

  async function submit() {
    if (!target) return;
    await onAdd({
      scope,
      truck_number: scope === "truck" ? target : undefined,
      driver_id: scope === "driver" ? target : undefined,
      alert_type: alertType,
      threshold_value: isOnOff ? null : value ? Number(value) : null,
      unit: alertType === "excessive_idle" ? "minutes" : alertType === "stunt_driving" ? "km_h" : isOnOff ? null : "km_h",
      is_active: true,
      effective_to: effectiveTo || null,
    });
    setTarget("");
    setValue("");
    setEffectiveTo("");
  }

  return (
    <div className="px-5 py-4 border-b border-[var(--line)] flex items-center gap-2 flex-wrap">
      <select value={scope} onChange={(e) => { setScope(e.target.value as "truck" | "driver"); setTarget(""); }} className="border border-[var(--line)] rounded-lg px-2 py-1.5 text-sm bg-[var(--surface)]">
        <option value="truck">Truck</option>
        <option value="driver">Driver</option>
      </select>
      <select value={target} onChange={(e) => setTarget(e.target.value)} className="border border-[var(--line)] rounded-lg px-2 py-1.5 text-sm bg-[var(--surface)] min-w-[140px]">
        <option value="">— select {scope} —</option>
        {(scope === "truck" ? trucks.map((t) => t.truck_number) : drivers.map((d) => d.driver_id)).map((id, i) => (
          <option key={id} value={id}>
            {scope === "driver" ? drivers[i]?.driver_name ?? id : id}
          </option>
        ))}
      </select>
      <select value={alertType} onChange={(e) => setAlertType(e.target.value)} className="border border-[var(--line)] rounded-lg px-2 py-1.5 text-sm bg-[var(--surface)]">
        {ALERT_TYPES.map((t) => (
          <option key={t} value={t}>
            {ALERT_TYPE_LABELS[t]}
          </option>
        ))}
      </select>
      {!isOnOff && (
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={alertType === "stunt_driving" ? "stricter over-by (km/h)" : "value"}
          className="w-36 border border-[var(--line)] rounded-lg px-2 py-1.5 text-sm bg-[var(--surface)] font-mono-num"
        />
      )}
      <input
        type="date"
        value={effectiveTo}
        onChange={(e) => setEffectiveTo(e.target.value)}
        title="Optional end date"
        className="border border-[var(--line)] rounded-lg px-2 py-1.5 text-sm bg-[var(--surface)]"
      />
      <button onClick={submit} className="px-3 py-1.5 rounded-full bg-[var(--ink)] text-white text-xs">
        Add override
      </button>
    </div>
  );
}

function RulesTab() {
  const [rules, setRules] = useState<RuleRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const json = await fetch("/api/alerts/rules").then((r) => r.json());
    setRules(json.rules ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function save(rule: RuleRow) {
    await fetch("/api/alerts/rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rule),
    });
    load();
  }

  if (loading) return <div className="text-sm text-[var(--ink-muted)]">Loading…</div>;

  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-4 border-b border-[var(--line)]">
        <div className="font-display italic text-lg">Notification rules</div>
        <div className="text-xs text-[var(--ink-muted)]">
          One rule per alert type. Stunt driving is locked to no-throttle — every occurrence emails, given the legal exposure.
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[var(--ink-muted)] text-xs border-b border-[var(--line)]">
              <th className="px-5 py-2 font-normal">Alert type</th>
              <th className="px-5 py-2 font-normal">Recipients</th>
              <th className="px-5 py-2 font-normal">Throttle (min)</th>
              <th className="px-5 py-2 font-normal">Active</th>
              <th className="px-5 py-2 font-normal"></th>
            </tr>
          </thead>
          <tbody>
            {rules.map((r) => (
              <RuleRowLine key={r.alert_type} rule={r} onSave={save} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RuleRowLine({ rule, onSave }: { rule: RuleRow; onSave: (r: RuleRow) => void }) {
  const locked = rule.alert_type === "stunt_driving";
  const [emails, setEmails] = useState((rule.recipient_emails ?? []).join(", "));
  const [throttle, setThrottle] = useState(rule.throttle_minutes.toString());
  const [active, setActive] = useState(rule.is_active);
  const [dirty, setDirty] = useState(false);

  return (
    <tr className="border-t border-[var(--line)]">
      <td className="px-5 py-2">{ALERT_TYPE_LABELS[rule.alert_type] ?? rule.alert_type}</td>
      <td className="px-5 py-2">
        <input
          value={emails}
          onChange={(e) => {
            setEmails(e.target.value);
            setDirty(true);
          }}
          placeholder="dispatch@kwtowing.com, ops@kwtowing.com"
          className="w-64 bg-transparent border-b border-transparent focus:border-[var(--line)] outline-none text-sm"
        />
      </td>
      <td className="px-5 py-2">
        {locked ? (
          <span className="text-xs text-[var(--ink-muted)]">0 (no throttle)</span>
        ) : (
          <input
            value={throttle}
            onChange={(e) => {
              setThrottle(e.target.value);
              setDirty(true);
            }}
            className="w-14 bg-transparent border-b border-transparent focus:border-[var(--line)] outline-none text-sm font-mono-num text-right"
          />
        )}
      </td>
      <td className="px-5 py-2">
        <input
          type="checkbox"
          checked={active}
          onChange={(e) => {
            setActive(e.target.checked);
            setDirty(true);
          }}
        />
      </td>
      <td className="px-5 py-2">
        {dirty && (
          <button
            onClick={() => {
              onSave({
                alert_type: rule.alert_type,
                recipient_emails: emails.split(",").map((e) => e.trim()).filter(Boolean),
                throttle_minutes: locked ? 0 : Number(throttle) || 0,
                is_active: active,
              });
              setDirty(false);
            }}
            className="text-xs px-3 py-1 rounded-full bg-[var(--ink)] text-white"
          >
            Save
          </button>
        )}
      </td>
    </tr>
  );
}
