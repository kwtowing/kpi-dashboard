"use client";

import { useState } from "react";

export type DateRange = { from: string | null; to: string | null };

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

function startOfWeek(d: Date) {
  const day = d.getDay(); // 0 = Sun
  const diff = day === 0 ? -6 : 1 - day; // Monday start
  const r = new Date(d);
  r.setDate(d.getDate() + diff);
  return r;
}

function computePreset(preset: string): DateRange {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (preset) {
    case "today":
      return { from: iso(today), to: iso(today) };
    case "yesterday": {
      const y = new Date(today);
      y.setDate(y.getDate() - 1);
      return { from: iso(y), to: iso(y) };
    }
    case "this_week": {
      const start = startOfWeek(today);
      return { from: iso(start), to: iso(today) };
    }
    case "last_week": {
      const start = startOfWeek(today);
      start.setDate(start.getDate() - 7);
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      return { from: iso(start), to: iso(end) };
    }
    case "this_month": {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      return { from: iso(start), to: iso(today) };
    }
    case "last_month": {
      const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const end = new Date(today.getFullYear(), today.getMonth(), 0);
      return { from: iso(start), to: iso(end) };
    }
    case "this_year": {
      const start = new Date(today.getFullYear(), 0, 1);
      return { from: iso(start), to: iso(today) };
    }
    case "last_year": {
      const start = new Date(today.getFullYear() - 1, 0, 1);
      const end = new Date(today.getFullYear() - 1, 11, 31);
      return { from: iso(start), to: iso(end) };
    }
    default:
      return { from: null, to: null };
  }
}

const PRESETS = [
  { value: "all", label: "All time" },
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "this_week", label: "This week" },
  { value: "last_week", label: "Last week" },
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "this_year", label: "This year" },
  { value: "last_year", label: "Last year" },
  { value: "custom", label: "Custom range" },
];

export default function DateRangeFilter({
  onChange,
}: {
  onChange: (range: DateRange) => void;
}) {
  const [preset, setPreset] = useState("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  function selectPreset(value: string) {
    setPreset(value);
    if (value === "all") {
      onChange({ from: null, to: null });
    } else if (value === "custom") {
      if (customFrom && customTo) onChange({ from: customFrom, to: customTo });
    } else {
      onChange(computePreset(value));
    }
  }

  function applyCustom(from: string, to: string) {
    setCustomFrom(from);
    setCustomTo(to);
    if (from && to) onChange({ from, to });
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <select
        value={preset}
        onChange={(e) => selectPreset(e.target.value)}
        className="border border-[var(--line)] rounded-lg px-3 py-1.5 text-sm bg-[var(--surface)]"
      >
        {PRESETS.map((p) => (
          <option key={p.value} value={p.value}>
            {p.label}
          </option>
        ))}
      </select>
      {preset === "custom" && (
        <>
          <input
            type="date"
            value={customFrom}
            onChange={(e) => applyCustom(e.target.value, customTo)}
            className="border border-[var(--line)] rounded-lg px-2 py-1.5 text-sm bg-[var(--surface)]"
          />
          <span className="text-xs text-[var(--ink-muted)]">to</span>
          <input
            type="date"
            value={customTo}
            onChange={(e) => applyCustom(customFrom, e.target.value)}
            className="border border-[var(--line)] rounded-lg px-2 py-1.5 text-sm bg-[var(--surface)]"
          />
        </>
      )}
    </div>
  );
}
