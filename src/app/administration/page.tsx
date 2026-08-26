"use client";

import { useEffect, useState, useCallback } from "react";
import { wageBreakdown } from "@/lib/wage";

type Driver = {
  driver_id: string;
  driver_name: string | null;
  status: string;
  samsara_driver_id: string | null;
  hourly_rate: number | null;
  monthly_salary: number | null;
  hours_per_day: number;
  days_per_week: number;
  compensation_type: string;
};

type Truck = {
  truck_number: string;
  unit_number: string | null;
  plate: string | null;
  vehicle_class: string | null;
  samsara_vehicle_id: string | null;
  samsara_name: string | null;
  status: string;
};

type SamsaraDriverOption = { id: string; name: string; username?: string };

export default function AdministrationPage() {
  const [tab, setTab] = useState<"drivers" | "trucks">("drivers");
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [samsaraDrivers, setSamsaraDrivers] = useState<SamsaraDriverOption[]>([]);
  const [samsaraConnected, setSamsaraConnected] = useState(true);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [d, t, sd] = await Promise.all([
      fetch("/api/drivers").then((r) => r.json()),
      fetch("/api/trucks-master").then((r) => r.json()),
      fetch("/api/samsara/drivers").then((r) => r.json()),
    ]);
    setDrivers(d.drivers ?? []);
    setTrucks(t.trucks ?? []);
    setSamsaraDrivers(sd.drivers ?? []);
    setSamsaraConnected(sd.connected);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function saveDriver(d: Driver) {
    await fetch("/api/drivers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(d),
    });
    load();
  }

  async function applyHoursPerDayToAll(hours: number) {
    await Promise.all(
      drivers.map((d) =>
        fetch("/api/drivers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...d, hours_per_day: hours }),
        })
      )
    );
    load();
  }

  async function saveTruck(t: Truck) {
    await fetch("/api/trucks-master", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(t),
    });
    load();
  }

  return (
    <div className="px-4 sm:px-8 py-6 sm:py-8 max-w-6xl">
      <h1 className="font-display italic text-3xl mb-1">Administration</h1>
      <p className="text-sm text-[var(--ink-muted)] mb-8">
        Master records for every driver and truck. Names and codes here link CAA calls,
        Samsara telematics, and cost data together.
      </p>

      <div className="inline-flex bg-[var(--surface)] border border-[var(--line)] rounded-full p-1 mb-6">
        {(["drivers", "trucks"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-full text-sm transition-colors capitalize ${
              tab === t ? "bg-[var(--ink)] text-white" : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
            }`}
          >
            {t === "drivers" ? "Driver master" : "Truck master"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-sm text-[var(--ink-muted)]">Loading…</div>
      ) : tab === "drivers" ? (
        <div className="space-y-3">
          {drivers.length > 0 && <BulkHoursControl onApply={applyHoursPerDayToAll} />}
          <div className="card overflow-hidden">
            {drivers.length === 0 ? (
              <div className="px-5 py-10 text-sm text-[var(--ink-muted)] text-center">
                No drivers yet — import a CAA report to auto-populate driver IDs here.
              </div>
            ) : (
              <div className="overflow-x-auto"><table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[var(--ink-muted)] text-xs border-b border-[var(--line)]">
                    <th className="px-5 py-2 font-normal">Driver ID</th>
                    <th className="px-5 py-2 font-normal">Name</th>
                    <th className="px-5 py-2 font-normal">Samsara driver ID</th>
                    <th className="px-5 py-2 font-normal">Compensation (CAD)</th>
                    <th className="px-5 py-2 font-normal">Schedule</th>
                    <th className="px-5 py-2 font-normal">Daily / hourly wage</th>
                    <th className="px-5 py-2 font-normal">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {drivers.map((d) => (
                    <DriverRow key={d.driver_id} driver={d} onSave={saveDriver} samsaraDrivers={samsaraDrivers} samsaraConnected={samsaraConnected} />
                  ))}
                </tbody>
              </table></div>
            )}
          </div>
        </div>
      ) : (
        <div className="card overflow-hidden">
          {trucks.length === 0 ? (
            <div className="px-5 py-10 text-sm text-[var(--ink-muted)] text-center">
              No trucks yet — import a CAA report to auto-populate truck codes here.
            </div>
          ) : (
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[var(--ink-muted)] text-xs border-b border-[var(--line)]">
                  <th className="px-5 py-2 font-normal">Truck code</th>
                  <th className="px-5 py-2 font-normal">Vehicle class</th>
                  <th className="px-5 py-2 font-normal">Samsara vehicle name</th>
                  <th className="px-5 py-2 font-normal">Status</th>
                </tr>
              </thead>
              <tbody>
                {trucks.map((t) => (
                  <TruckRow key={t.truck_number} truck={t} onSave={saveTruck} />
                ))}
              </tbody>
            </table></div>
          )}
        </div>
      )}
      <p className="text-xs text-[var(--ink-muted)] mt-4">
        Setting &quot;Samsara vehicle name&quot; here is what links a truck to live Samsara data
        on the Trucks page — it doesn&apos;t have to match the truck code exactly.
      </p>
    </div>
  );
}

function BulkHoursControl({ onApply }: { onApply: (hours: number) => Promise<void> }) {
  const [hours, setHours] = useState("12");
  const [applying, setApplying] = useState(false);

  return (
    <div className="card px-5 py-3.5 flex items-center gap-3 flex-wrap">
      <span className="text-sm text-[var(--ink-muted)]">Set hours/day for every driver:</span>
      <input
        value={hours}
        onChange={(e) => setHours(e.target.value)}
        className="w-16 border border-[var(--line)] rounded-lg px-2 py-1 text-sm font-mono-num text-center bg-[var(--surface)]"
      />
      <button
        onClick={async () => {
          setApplying(true);
          await onApply(Number(hours) || 12);
          setApplying(false);
        }}
        disabled={applying}
        className="px-3 py-1.5 rounded-full bg-[var(--ink)] text-white text-xs disabled:opacity-50"
      >
        {applying ? "Applying…" : "Apply to all drivers"}
      </button>
    </div>
  );
}

function DriverRow({
  driver,
  onSave,
  samsaraDrivers,
  samsaraConnected,
}: {
  driver: Driver;
  onSave: (d: Driver) => void;
  samsaraDrivers: { id: string; name: string; username?: string }[];
  samsaraConnected: boolean;
}) {
  const [name, setName] = useState(driver.driver_name ?? "");
  const [samsaraId, setSamsaraId] = useState(driver.samsara_driver_id ?? "");
  const [compType, setCompType] = useState(driver.compensation_type ?? "hourly");
  const [rate, setRate] = useState(driver.hourly_rate?.toString() ?? "");
  const [salary, setSalary] = useState(driver.monthly_salary?.toString() ?? "");
  const [hoursPerDay, setHoursPerDay] = useState(driver.hours_per_day?.toString() ?? "12");
  const [daysPerWeek, setDaysPerWeek] = useState(driver.days_per_week?.toString() ?? "5");
  const [dirty, setDirty] = useState(false);

  const breakdown = wageBreakdown(
    compType,
    rate ? Number(rate) : null,
    salary ? Number(salary) : null,
    Number(hoursPerDay) || 8,
    Number(daysPerWeek) || 5
  );

  // If the currently-saved value doesn't match any real Samsara driver ID,
  // flag it — this is exactly what happened with usernames like "Davood32"
  // being entered instead of Samsara's actual internal driver ID.
  const currentValueIsStale =
    samsaraConnected && samsaraDrivers.length > 0 && samsaraId && !samsaraDrivers.some((d) => d.id === samsaraId);

  return (
    <tr className="border-t border-[var(--line)]">
      <td className="px-5 py-2 font-mono-num">{driver.driver_id}</td>
      <td className="px-5 py-2">
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setDirty(true);
          }}
          placeholder="—"
          className="w-full bg-transparent border-b border-transparent focus:border-[var(--line)] outline-none text-sm"
        />
      </td>
      <td className="px-5 py-2">
        {samsaraConnected && samsaraDrivers.length > 0 ? (
          <select
            value={samsaraId}
            onChange={(e) => {
              setSamsaraId(e.target.value);
              setDirty(true);
            }}
            className={`bg-transparent text-sm outline-none max-w-[180px] ${currentValueIsStale ? "text-[var(--cost)]" : ""}`}
          >
            <option value="">— not linked —</option>
            {samsaraId && currentValueIsStale && (
              <option value={samsaraId}>{samsaraId} (not found in Samsara)</option>
            )}
            {samsaraDrivers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
                {d.username ? ` (${d.username})` : ""}
              </option>
            ))}
          </select>
        ) : (
          <input
            value={samsaraId}
            onChange={(e) => {
              setSamsaraId(e.target.value);
              setDirty(true);
            }}
            placeholder="—"
            className="w-full bg-transparent border-b border-transparent focus:border-[var(--line)] outline-none text-sm font-mono-num"
          />
        )}
        {currentValueIsStale && (
          <div className="text-[10px] text-[var(--cost)] mt-0.5">Doesn&apos;t match a real Samsara driver</div>
        )}
      </td>
      <td className="px-5 py-2">
        <div className="flex items-center gap-1.5">
          <select
            value={compType}
            onChange={(e) => {
              setCompType(e.target.value);
              setDirty(true);
            }}
            className="bg-transparent text-xs outline-none text-[var(--ink-muted)]"
          >
            <option value="hourly">Hourly</option>
            <option value="salary">Monthly salary</option>
          </select>
          {compType === "salary" ? (
            <input
              value={salary}
              onChange={(e) => {
                setSalary(e.target.value);
                setDirty(true);
              }}
              placeholder="e.g. 5200"
              className="w-24 bg-transparent border-b border-transparent focus:border-[var(--line)] outline-none text-sm font-mono-num"
            />
          ) : (
            <input
              value={rate}
              onChange={(e) => {
                setRate(e.target.value);
                setDirty(true);
              }}
              placeholder="e.g. 28"
              className="w-20 bg-transparent border-b border-transparent focus:border-[var(--line)] outline-none text-sm font-mono-num"
            />
          )}
        </div>
      </td>
      <td className="px-5 py-2">
        <div className="flex items-center gap-1 text-xs text-[var(--ink-muted)]">
          <input
            value={hoursPerDay}
            onChange={(e) => {
              setHoursPerDay(e.target.value);
              setDirty(true);
            }}
            className="w-9 bg-transparent border-b border-transparent focus:border-[var(--line)] outline-none text-xs font-mono-num text-right"
          />
          <span>hr/day ×</span>
          <input
            value={daysPerWeek}
            onChange={(e) => {
              setDaysPerWeek(e.target.value);
              setDirty(true);
            }}
            className="w-8 bg-transparent border-b border-transparent focus:border-[var(--line)] outline-none text-xs font-mono-num text-right"
          />
          <span>day/wk</span>
        </div>
      </td>
      <td className="px-5 py-2 font-mono-num text-xs">
        {breakdown ? (
          <div className="text-[var(--ink-muted)]">
            <div>${breakdown.daily.toFixed(2)}/day</div>
            <div>${breakdown.hourly.toFixed(2)}/hr</div>
          </div>
        ) : (
          <span className="text-[var(--ink-muted)]">—</span>
        )}
      </td>
      <td className="px-5 py-2">
        {dirty ? (
          <button
            onClick={() => {
              onSave({
                ...driver,
                driver_name: name,
                samsara_driver_id: samsaraId,
                compensation_type: compType,
                hourly_rate: compType === "hourly" && rate ? Number(rate) : null,
                monthly_salary: compType === "salary" && salary ? Number(salary) : null,
                hours_per_day: Number(hoursPerDay) || 8,
                days_per_week: Number(daysPerWeek) || 5,
              });
              setDirty(false);
            }}
            className="text-xs px-3 py-1 rounded-full bg-[var(--ink)] text-white"
          >
            Save
          </button>
        ) : (
          <span className="text-xs text-[var(--ink-muted)] capitalize">{driver.status}</span>
        )}
      </td>
    </tr>
  );
}

function TruckRow({ truck, onSave }: { truck: Truck; onSave: (t: Truck) => void }) {
  const [samsaraName, setSamsaraName] = useState(truck.samsara_name ?? "");
  const [vehicleClass, setVehicleClass] = useState(truck.vehicle_class ?? "");
  const [dirty, setDirty] = useState(false);

  return (
    <tr className="border-t border-[var(--line)]">
      <td className="px-5 py-2 font-medium">{truck.truck_number}</td>
      <td className="px-5 py-2">
        <select
          value={vehicleClass}
          onChange={(e) => {
            setVehicleClass(e.target.value);
            setDirty(true);
          }}
          className="bg-transparent text-sm outline-none"
        >
          <option value="">—</option>
          <option value="light">Light</option>
          <option value="medium">Medium</option>
          <option value="heavy">Heavy</option>
          <option value="flatbed">Flatbed</option>
        </select>
      </td>
      <td className="px-5 py-2">
        <input
          value={samsaraName}
          onChange={(e) => {
            setSamsaraName(e.target.value);
            setDirty(true);
          }}
          placeholder="e.g. WL2"
          className="w-full bg-transparent border-b border-transparent focus:border-[var(--line)] outline-none text-sm font-mono-num"
        />
      </td>
      <td className="px-5 py-2">
        {dirty ? (
          <button
            onClick={() => {
              onSave({ ...truck, samsara_name: samsaraName, vehicle_class: vehicleClass || null });
              setDirty(false);
            }}
            className="text-xs px-3 py-1 rounded-full bg-[var(--ink)] text-white"
          >
            Save
          </button>
        ) : (
          <span className="text-xs text-[var(--ink-muted)] capitalize">{truck.status}</span>
        )}
      </td>
    </tr>
  );
}
