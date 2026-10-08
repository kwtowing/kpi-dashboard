// Shared (browser + server) definitions for the Reports section.
// Keep this file free of server-only imports (no database code) so the Reports
// page can use it directly.

export type Unit = "currency" | "number" | "percent" | "hours" | "minutes" | "km";

export type MetricDef = {
  key: string;
  label: string;
  unit: Unit;
  // Whether an increase is good news, bad news, or just informational.
  good: "up" | "down" | "neutral";
  // Ratios/averages have no meaningful value when nothing happened (shown as "—", not 0).
  ratio?: boolean;
  // Only shown in the summary scorecard, not in the breakdown table.
  totalOnly?: boolean;
};

export type Values = Record<string, number | null>;

export type CategoryId =
  | "financial"
  | "caa"
  | "drivers"
  | "trucks"
  | "safety";

export type CategoryDef = {
  id: CategoryId;
  label: string;
  blurb: string;
  dimension: string; // what each breakdown row is ("Driver", "Truck" ...)
  metrics: MetricDef[];
  // Optional alternative ways to break the category down.
  breakdowns?: { value: string; label: string }[];
  hasTrend: boolean;
};

const CURRENCY_GOOD_UP = { unit: "currency", good: "up" } as const;

export const CATEGORIES: CategoryDef[] = [
  {
    id: "financial",
    label: "Revenue & Cost",
    blurb: "Revenue, costs (including driver labour) and profit.",
    dimension: "Category",
    hasTrend: true,
    metrics: [
      { key: "revenue", label: "Revenue", ...CURRENCY_GOOD_UP },
      { key: "cost", label: "Cost", unit: "currency", good: "down" },
      { key: "profit", label: "Profit", ...CURRENCY_GOOD_UP },
      { key: "margin", label: "Profit margin", unit: "percent", good: "up", ratio: true, totalOnly: true },
    ],
  },
  {
    id: "caa",
    label: "CAA Calls",
    blurb: "Call volume, revenue, kilometres, wait and job time.",
    dimension: "Trouble code",
    hasTrend: true,
    breakdowns: [
      { value: "trouble_cd", label: "By trouble code" },
      { value: "garage", label: "By garage" },
      { value: "club_code", label: "By club code" },
    ],
    metrics: [
      { key: "calls", label: "Calls", unit: "number", good: "up" },
      { key: "revenue", label: "Revenue", ...CURRENCY_GOOD_UP },
      { key: "avg_revenue_per_call", label: "Revenue per call", unit: "currency", good: "up", ratio: true },
      { key: "km_paid", label: "KM paid", unit: "km", good: "up" },
      { key: "revenue_per_km", label: "Revenue per km", unit: "currency", good: "up", ratio: true },
      { key: "zero_paid", label: "Zero-paid calls", unit: "number", good: "down" },
      { key: "avg_wait", label: "Avg PTA wait", unit: "minutes", good: "down", ratio: true },
      { key: "avg_duration", label: "Avg job time", unit: "hours", good: "neutral", ratio: true },
    ],
  },
  {
    id: "drivers",
    label: "Drivers",
    blurb: "Calls, revenue, hours and labour cost for each driver.",
    dimension: "Driver",
    hasTrend: false,
    metrics: [
      { key: "calls", label: "Calls", unit: "number", good: "up" },
      { key: "revenue", label: "Revenue", ...CURRENCY_GOOD_UP },
      { key: "hours", label: "Hours on calls", unit: "hours", good: "neutral" },
      { key: "labour_cost", label: "Labour cost", unit: "currency", good: "down", ratio: true },
      { key: "contribution", label: "Contribution", unit: "currency", good: "up", ratio: true },
      { key: "km_paid", label: "KM paid", unit: "km", good: "up" },
      { key: "zero_paid", label: "Zero-paid calls", unit: "number", good: "down" },
    ],
  },
  {
    id: "trucks",
    label: "Trucks",
    blurb: "Calls, revenue and kilometres for each truck.",
    dimension: "Truck",
    hasTrend: false,
    metrics: [
      { key: "calls", label: "Calls", unit: "number", good: "up" },
      { key: "revenue", label: "Revenue", ...CURRENCY_GOOD_UP },
      { key: "km_paid", label: "KM paid", unit: "km", good: "up" },
      { key: "revenue_per_km", label: "Revenue per km", unit: "currency", good: "up", ratio: true },
      { key: "zero_paid", label: "Zero-paid calls", unit: "number", good: "down" },
    ],
  },
  {
    id: "safety",
    label: "Driver Behaviour",
    blurb: "Samsara safety events — speeding, harsh braking and more.",
    dimension: "Behaviour",
    hasTrend: false,
    breakdowns: [
      { value: "label", label: "By behaviour" },
      { value: "driver", label: "By driver" },
    ],
    metrics: [{ key: "events", label: "Safety events", unit: "number", good: "down" }],
  },
];

export function getCategory(id: string): CategoryDef | undefined {
  return CATEGORIES.find((c) => c.id === id);
}

export type PeriodType = "week" | "month" | "quarter" | "year" | "custom";
export type CompareMode = "previous" | "yoy" | "custom";

export type ResolvedPeriod = {
  from: string; // YYYY-MM-DD
  to: string;
  label: string;
  range: string;
};

export type CompareRow = { key: string; label: string; a: Values; b: Values };

export type CompareResponse = {
  category: CategoryId;
  connected?: boolean; // false when the live source (Samsara) isn't connected
  reason?: string;
  periodA: ResolvedPeriod;
  periodB: ResolvedPeriod;
  note: string | null;
  notes: string[];
  totals: { a: Values; b: Values };
  rows: CompareRow[];
};

export type TrendBucket = { start: string; end: string; label: string; partial: boolean; values: Values };
export type TrendResponse = {
  category: CategoryId;
  granularity: string;
  buckets: TrendBucket[];
};

// ---- Formatting & change helpers ----

export function formatValue(v: number | null | undefined, unit: Unit): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  switch (unit) {
    case "currency": {
      const abs = Math.abs(v);
      const s = abs.toLocaleString(undefined, {
        minimumFractionDigits: abs < 100 && abs % 1 !== 0 ? 2 : 0,
        maximumFractionDigits: abs < 100 ? 2 : 0,
      });
      return `${v < 0 ? "-" : ""}$${s}`;
    }
    case "percent":
      return `${v.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
    case "hours":
      return `${v.toLocaleString(undefined, { maximumFractionDigits: 1 })} h`;
    case "minutes":
      return `${v.toLocaleString(undefined, { maximumFractionDigits: 1 })} min`;
    case "km":
      return `${v.toLocaleString(undefined, { maximumFractionDigits: 0 })} km`;
    default:
      return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
  }
}

export type Change = {
  delta: number | null;
  pct: number | null; // null when there is no earlier figure to compare to
  isNew: boolean; // had nothing before, has something now
  points: boolean; // the metric is itself a percentage, so change is in percentage points
  direction: "up" | "down" | "flat" | null;
  tone: "good" | "bad" | "neutral";
};

export function computeChange(a: number | null | undefined, b: number | null | undefined, m: MetricDef): Change {
  const hasA = a !== null && a !== undefined && Number.isFinite(a);
  const hasB = b !== null && b !== undefined && Number.isFinite(b);
  if (!hasA || !hasB) {
    return { delta: null, pct: null, isNew: false, points: false, direction: null, tone: "neutral" };
  }
  const delta = (a as number) - (b as number);
  const points = m.unit === "percent";
  const isNew = !points && (b as number) === 0 && (a as number) !== 0;
  // For a metric that is already a percentage, "% change" would be a percentage of a percentage — use points instead.
  const pct = points ? delta : (b as number) === 0 ? null : (delta / Math.abs(b as number)) * 100;
  // Treat tiny movements as "flat" so rounding noise isn't coloured red or green.
  const flat = pct !== null ? Math.abs(pct) < 0.5 : delta === 0;
  const direction = flat ? "flat" : delta > 0 ? "up" : "down";
  let tone: Change["tone"] = "neutral";
  if (!flat && m.good !== "neutral") {
    tone = (m.good === "up") === (delta > 0) ? "good" : "bad";
  }
  return { delta, pct, isNew, points, direction, tone };
}

export function formatDelta(delta: number | null, unit: Unit): string {
  if (delta === null) return "—";
  if (delta === 0) return "0";
  const sign = delta > 0 ? "+" : "-";
  if (unit === "percent") return `${sign}${Math.abs(delta).toLocaleString(undefined, { maximumFractionDigits: 1 })} pts`;
  // Reuse the unit formatter on the absolute value, then re-attach the sign.
  return `${sign}${formatValue(Math.abs(delta), unit).replace(/^-/, "")}`;
}

export function formatPct(c: Change): string {
  if (c.isNew) return "new";
  if (c.pct === null) return "—";
  const sign = c.pct > 0 ? "+" : c.pct < 0 ? "-" : "";
  return `${sign}${Math.abs(c.pct).toLocaleString(undefined, { maximumFractionDigits: 1 })}${c.points ? " pts" : "%"}`;
}
