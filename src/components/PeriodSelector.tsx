"use client";

const PERIODS = [
  { value: "day", label: "Daily" },
  { value: "week", label: "Weekly" },
  { value: "month", label: "Monthly" },
  { value: "year", label: "Annual" },
];

export default function PeriodSelector({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="inline-flex bg-[var(--surface)] border border-[var(--line)] rounded-full p-1">
      {PERIODS.map((p) => (
        <button
          key={p.value}
          onClick={() => onChange(p.value)}
          className={`px-4 py-1.5 rounded-full text-sm transition-colors ${
            value === p.value
              ? "bg-[var(--ink)] text-white"
              : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
          }`}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}
