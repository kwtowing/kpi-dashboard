"use client";

import { useEffect, useState, useCallback } from "react";

type Driver = {
  driver_id: string;
  driver_name: string | null;
  status: string;
  samsara_driver_id: string | null;
  hourly_rate: number | null;
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

export default function AdministrationPage() {
  const [tab, setTab] = useState<"drivers" | "trucks">("drivers");
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [d, t] = await Promise.all([
      fetch("/api/drivers").then((r) => r.json()),
      fetch("/api/trucks-master").then((r) => r.json()),
    ]);
    setDrivers(d.drivers ?? []);
    setTrucks(t.trucks ?? []);
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

  async function saveTruck(t: Truck) {
    await fetch("/api/trucks-master", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(t),
    });
    load();
  }

  return (
    <div className="px-4 sm:px-8 py-6 sm:py-8 max-w-4xl">
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
                  <th className="px-5 py-2 font-normal">Hourly rate (CAD)</th>
                  <th className="px-5 py-2 font-normal">Status</th>
                </tr>
              </thead>
              <tbody>
                {drivers.map((d) => (
                  <DriverRow key={d.driver_id} driver={d} onSave={saveDriver} />
                ))}
              </tbody>
            </table></div>
          )}
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

function DriverRow({ driver, onSave }: { driver: Driver; onSave: (d: Driver) => void }) {
  const [name, setName] = useState(driver.driver_name ?? "");
  const [samsaraId, setSamsaraId] = useState(driver.samsara_driver_id ?? "");
  const [rate, setRate] = useState(driver.hourly_rate?.toString() ?? "");
  const [dirty, setDirty] = useState(false);

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
        <input
          value={samsaraId}
          onChange={(e) => {
            setSamsaraId(e.target.value);
            setDirty(true);
          }}
          placeholder="—"
          className="w-full bg-transparent border-b border-transparent focus:border-[var(--line)] outline-none text-sm font-mono-num"
        />
      </td>
      <td className="px-5 py-2">
        <input
          value={rate}
          onChange={(e) => {
            setRate(e.target.value);
            setDirty(true);
          }}
          placeholder="—"
          className="w-24 bg-transparent border-b border-transparent focus:border-[var(--line)] outline-none text-sm font-mono-num"
        />
      </td>
      <td className="px-5 py-2">
        {dirty ? (
          <button
            onClick={() => {
              onSave({ ...driver, driver_name: name, samsara_driver_id: samsaraId, hourly_rate: rate ? Number(rate) : null });
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
