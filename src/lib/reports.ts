// Server-side logic for the Reports section: period maths and the per-category
// queries. The Reports page itself only uses ./reportTypes (no database code).

import {
  addDays,
  differenceInCalendarDays,
  endOfMonth,
  endOfQuarter,
  endOfWeek,
  endOfYear,
  format,
  min as minDate,
  parseISO,
  startOfMonth,
  startOfQuarter,
  startOfWeek,
  startOfYear,
  subMonths,
  subQuarters,
  subWeeks,
  subYears,
} from "date-fns";
import { query } from "@/lib/db";
import { COMBINED_CTE } from "@/lib/combined";
import { listSafetyEvents, SamsaraNotConfigured } from "@/lib/connectors/samsara";
import type {
  CategoryId,
  CompareMode,
  CompareResponse,
  CompareRow,
  MetricDef,
  PeriodType,
  ResolvedPeriod,
  TrendBucket,
  TrendResponse,
  Values,
} from "@/lib/reportTypes";
import { getCategory } from "@/lib/reportTypes";

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
export const isIsoDate = (s: string | null | undefined): s is string => !!s && ISO_DATE.test(s);

const iso = (d: Date) => format(d, "yyyy-MM-dd");

// "Today" in the business's own time zone, not the server's (Vercel runs on UTC).
export function torontoToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto" }).format(new Date());
}

// Weeks run Monday–Sunday, matching Postgres date_trunc('week', ...).
const WEEK = { weekStartsOn: 1 } as const;

type Fixed = Exclude<PeriodType, "custom">;

function bounds(type: Fixed, d: Date): [Date, Date] {
  switch (type) {
    case "week":
      return [startOfWeek(d, WEEK), endOfWeek(d, WEEK)];
    case "month":
      return [startOfMonth(d), endOfMonth(d)];
    case "quarter":
      return [startOfQuarter(d), endOfQuarter(d)];
    case "year":
      return [startOfYear(d), endOfYear(d)];
  }
}

function shiftBack(type: Fixed, d: Date, n = 1): Date {
  switch (type) {
    case "week":
      return subWeeks(d, n);
    case "month":
      return subMonths(d, n);
    case "quarter":
      return subQuarters(d, n);
    case "year":
      return subYears(d, n);
  }
}

function rangeText(from: Date, to: Date): string {
  if (iso(from) === iso(to)) return format(from, "MMM d, yyyy");
  if (from.getFullYear() === to.getFullYear()) {
    return `${format(from, "MMM d")} – ${format(to, "MMM d, yyyy")}`;
  }
  return `${format(from, "MMM d, yyyy")} – ${format(to, "MMM d, yyyy")}`;
}

function periodLabel(type: PeriodType, from: Date, to: Date, suffix = ""): ResolvedPeriod {
  let base: string;
  if (type === "month") base = format(from, "MMMM yyyy");
  else if (type === "quarter") base = `Q${Math.floor(from.getMonth() / 3) + 1} ${from.getFullYear()}`;
  else if (type === "year") base = `${from.getFullYear()}`;
  else if (type === "week") base = `Week of ${format(from, "MMM d")}`;
  else base = "Custom period";
  return { from: iso(from), to: iso(to), label: `${base}${suffix}`, range: rangeText(from, to) };
}

export type PeriodOptions = {
  type: PeriodType;
  anchor?: string | null;
  compare: CompareMode;
  likeForLike: boolean;
  aFrom?: string | null;
  aTo?: string | null;
  bFrom?: string | null;
  bTo?: string | null;
};

export function resolvePeriods(o: PeriodOptions): { a: ResolvedPeriod; b: ResolvedPeriod; note: string | null } {
  const today = parseISO(torontoToday());

  // ----- Custom range for the current period -----
  if (o.type === "custom") {
    const from = isIsoDate(o.aFrom) ? parseISO(o.aFrom) : startOfMonth(today);
    const to = isIsoDate(o.aTo) ? parseISO(o.aTo) : today;
    const [af, at] = from <= to ? [from, to] : [to, from];
    const len = differenceInCalendarDays(at, af) + 1;
    let bf: Date;
    let bt: Date;
    if (o.compare === "custom" && isIsoDate(o.bFrom) && isIsoDate(o.bTo)) {
      const x = parseISO(o.bFrom);
      const y = parseISO(o.bTo);
      [bf, bt] = x <= y ? [x, y] : [y, x];
    } else if (o.compare === "yoy") {
      bf = subYears(af, 1);
      bt = subYears(at, 1);
    } else {
      bt = addDays(af, -1);
      bf = addDays(bt, -(len - 1));
    }
    const bLen = differenceInCalendarDays(bt, bf) + 1;
    return {
      a: periodLabel("custom", af, at),
      b: periodLabel("custom", bf, bt),
      note: bLen !== len ? `The two periods are different lengths (${len} vs ${bLen} days), so totals are not like-for-like.` : null,
    };
  }

  // ----- Calendar periods (week / month / quarter / year) -----
  const type = o.type;
  let anchor = isIsoDate(o.anchor) ? parseISO(o.anchor) : today;
  if (anchor > today) anchor = today;

  const [as, ae] = bounds(type, anchor);
  const partial = ae > today;
  const aEnd = partial && o.likeForLike ? minDate([ae, today]) : ae;
  const clamped = aEnd < ae;

  let bs: Date;
  let be: Date;
  if (o.compare === "yoy") {
    bs = subYears(as, 1);
    be = subYears(aEnd, 1);
  } else {
    [bs, be] = bounds(type, shiftBack(type, anchor));
    if (clamped) {
      const len = differenceInCalendarDays(aEnd, as) + 1;
      be = minDate([be, addDays(bs, len - 1)]);
    }
  }

  const a = periodLabel(type, as, aEnd, clamped ? " to date" : partial ? " (in progress)" : "");
  const b = periodLabel(type, bs, be, o.compare === "yoy" ? " (last year)" : clamped ? " (same days)" : "");

  let note: string | null = null;
  if (clamped) {
    const days = differenceInCalendarDays(aEnd, as) + 1;
    note = `This ${type} isn't over yet, so the earlier period is cut to the same ${days} day${days === 1 ? "" : "s"} for a fair comparison.`;
  } else if (partial) {
    note = `This ${type} isn't over yet, so its totals are still growing — compare with care.`;
  }
  return { a, b, note };
}

// ---------------------------------------------------------------------------
// Category queries — each returns totals + rows for ONE date range.
// ---------------------------------------------------------------------------

type RangeResult = { totals: Values; rows: { key: string; label: string; values: Values }[]; notes?: string[] };

const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));
const numOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
const round2 = (n: number) => Math.round(n * 100) / 100;

// ---- Revenue & cost ----
function finValues(revenue: number, cost: number): Values {
  const profit = revenue - cost;
  return {
    revenue: round2(revenue),
    cost: round2(cost),
    profit: round2(profit),
    margin: revenue > 0 ? round2((profit / revenue) * 100) : null,
  };
}

async function financialRange(from: string, to: string): Promise<RangeResult> {
  const rows = await query<{ category: string; revenue: string; cost: string }>(
    `${COMBINED_CTE}
     SELECT category,
            COALESCE(SUM(CASE WHEN kind = 'revenue' THEN amount ELSE 0 END), 0) AS revenue,
            COALESCE(SUM(CASE WHEN kind = 'cost' THEN amount ELSE 0 END), 0) AS cost
     FROM combined
     WHERE d >= $1 AND d <= $2
     GROUP BY category`,
    [from, to]
  );
  let rev = 0;
  let cost = 0;
  const out = rows.map((r) => {
    rev += num(r.revenue);
    cost += num(r.cost);
    return { key: r.category, label: r.category, values: finValues(num(r.revenue), num(r.cost)) };
  });
  return { totals: finValues(rev, cost), rows: out };
}

// ---- CAA calls (also reused by trucks) ----
const CAA_AGG = `
  COUNT(*) AS calls,
  COALESCE(SUM(total_cost), 0) AS revenue,
  COALESCE(SUM(towed_kms_paid), 0) AS km_paid,
  COUNT(*) FILTER (WHERE total_cost = 0) AS zero_paid,
  AVG(pta_wait) AS avg_wait,
  AVG(CASE WHEN re_dt IS NOT NULL AND cl_dt IS NOT NULL AND cl_dt > re_dt
           THEN EXTRACT(EPOCH FROM (cl_dt - re_dt)) / 3600.0 END) AS avg_duration`;

function caaValues(r: any): Values {
  const calls = num(r.calls);
  const revenue = num(r.revenue);
  const km = num(r.km_paid);
  return {
    calls,
    revenue: round2(revenue),
    avg_revenue_per_call: calls > 0 ? round2(revenue / calls) : null,
    km_paid: round2(km),
    revenue_per_km: km > 0 ? round2(revenue / km) : null,
    zero_paid: num(r.zero_paid),
    avg_wait: numOrNull(r.avg_wait) === null ? null : round2(num(r.avg_wait)),
    avg_duration: numOrNull(r.avg_duration) === null ? null : round2(num(r.avg_duration)),
  };
}

const CAA_DIMENSIONS: Record<string, string> = {
  trouble_cd: "trouble_cd",
  garage: "garage",
  club_code: "club_code",
};

async function caaRange(from: string, to: string, by: string): Promise<RangeResult> {
  const col = CAA_DIMENSIONS[by] ?? "trouble_cd"; // whitelisted — never user text in SQL
  const [totals, rows] = await Promise.all([
    query(`SELECT ${CAA_AGG} FROM tow_calls WHERE receive_date >= $1 AND receive_date <= $2`, [from, to]),
    query(
      `SELECT COALESCE(NULLIF(TRIM(${col}::text), ''), 'Unspecified') AS dim, ${CAA_AGG}
       FROM tow_calls WHERE receive_date >= $1 AND receive_date <= $2
       GROUP BY 1`,
      [from, to]
    ),
  ]);
  return {
    totals: caaValues(totals[0] ?? {}),
    rows: rows.map((r: any) => ({ key: r.dim, label: r.dim, values: caaValues(r) })),
  };
}

// ---- Trucks ----
async function trucksRange(from: string, to: string): Promise<RangeResult> {
  const [totals, rows] = await Promise.all([
    query(`SELECT ${CAA_AGG} FROM tow_calls WHERE truck IS NOT NULL AND receive_date >= $1 AND receive_date <= $2`, [from, to]),
    query(
      `SELECT truck AS dim, ${CAA_AGG}
       FROM tow_calls WHERE truck IS NOT NULL AND receive_date >= $1 AND receive_date <= $2
       GROUP BY truck`,
      [from, to]
    ),
  ]);
  return {
    totals: caaValues(totals[0] ?? {}),
    rows: rows.map((r: any) => ({ key: r.dim, label: r.dim, values: caaValues(r) })),
  };
}

// ---- Drivers ----
async function driversRange(from: string, to: string): Promise<RangeResult> {
  const [calls, labour, names] = await Promise.all([
    query<any>(
      `SELECT driver_id,
              COUNT(*) AS calls,
              COALESCE(SUM(total_cost), 0) AS revenue,
              COALESCE(SUM(towed_kms_paid), 0) AS km_paid,
              COUNT(*) FILTER (WHERE total_cost = 0) AS zero_paid,
              COALESCE(SUM(CASE WHEN re_dt IS NOT NULL AND cl_dt IS NOT NULL AND cl_dt > re_dt
                                THEN EXTRACT(EPOCH FROM (cl_dt - re_dt)) / 3600.0 ELSE 0 END), 0) AS hours
       FROM tow_calls
       WHERE driver_id IS NOT NULL AND receive_date >= $1 AND receive_date <= $2
       GROUP BY driver_id`,
      [from, to]
    ),
    query<any>(
      `${COMBINED_CTE}
       SELECT driver_id, SUM(amount) AS labour
       FROM combined
       WHERE kind = 'cost' AND category = 'Driver labour' AND driver_id IS NOT NULL
         AND d >= $1 AND d <= $2
       GROUP BY driver_id`,
      [from, to]
    ),
    query<{ driver_id: string; driver_name: string | null }>(`SELECT driver_id, driver_name FROM driver_master`),
  ]);

  const labourBy = new Map(labour.map((r: any) => [String(r.driver_id), num(r.labour)]));
  const nameBy = new Map(names.map((r) => [r.driver_id, r.driver_name]));

  let calls_ = 0, revenue = 0, km = 0, zero = 0, hours = 0, labourTotal = 0, missingRate = 0;
  const rows = calls.map((r: any) => {
    const id = String(r.driver_id);
    const rev = num(r.revenue);
    const lab = labourBy.has(id) ? (labourBy.get(id) as number) : null;
    if (lab === null) missingRate += 1;
    calls_ += num(r.calls);
    revenue += rev;
    km += num(r.km_paid);
    zero += num(r.zero_paid);
    hours += num(r.hours);
    if (lab !== null) labourTotal += lab;
    const name = nameBy.get(id);
    return {
      key: id,
      label: name ? `${name} (${id})` : id,
      values: {
        calls: num(r.calls),
        revenue: round2(rev),
        hours: round2(num(r.hours)),
        labour_cost: lab === null ? null : round2(lab),
        contribution: lab === null ? null : round2(rev - lab),
        km_paid: round2(num(r.km_paid)),
        zero_paid: num(r.zero_paid),
      } as Values,
    };
  });

  const notes: string[] = [];
  if (missingRate > 0) {
    notes.push(
      `${missingRate} driver${missingRate === 1 ? "" : "s"} with calls in this period ${missingRate === 1 ? "has" : "have"} no pay rate on file, so labour cost and contribution are blank for them (and left out of the totals' labour figure).`
    );
  }
  return {
    totals: {
      calls: calls_,
      revenue: round2(revenue),
      hours: round2(hours),
      labour_cost: round2(labourTotal),
      contribution: round2(revenue - labourTotal),
      km_paid: round2(km),
      zero_paid: zero,
    },
    rows,
    notes,
  };
}

// ---- Driver behaviour (live from Samsara) ----
class NotConnected extends Error {}

async function safetyRange(from: string, to: string, by: string): Promise<RangeResult> {
  const drivers = await query<{ driver_id: string; driver_name: string | null; samsara_driver_id: string }>(
    `SELECT driver_id, driver_name, samsara_driver_id FROM driver_master
     WHERE samsara_driver_id IS NOT NULL AND samsara_driver_id <> ''`
  );
  const byId = new Map(drivers.map((d) => [d.samsara_driver_id, d]));
  let events;
  try {
    events = await listSafetyEvents(
      new Date(`${from}T00:00:00Z`).toISOString(),
      new Date(`${to}T23:59:59Z`).toISOString(),
      drivers.map((d) => d.samsara_driver_id)
    );
  } catch (e) {
    if (e instanceof SamsaraNotConfigured) throw new NotConnected("not_configured");
    throw e;
  }

  const counts = new Map<string, { label: string; n: number }>();
  const bump = (key: string, label: string) => {
    const cur = counts.get(key) ?? { label, n: 0 };
    cur.n += 1;
    counts.set(key, cur);
  };
  for (const ev of events) {
    if (by === "driver") {
      const internal = ev.driverId ? byId.get(ev.driverId) : undefined;
      const name = internal?.driver_name ?? ev.driverName ?? "Unknown driver";
      bump(internal?.driver_id ?? ev.driverId ?? "unknown", internal ? `${name} (${internal.driver_id})` : name);
    } else {
      for (const l of ev.behaviorLabels.length > 0 ? ev.behaviorLabels : ["Unspecified"]) bump(l, l);
    }
  }
  return {
    totals: { events: events.length },
    rows: [...counts.entries()].map(([key, v]) => ({ key, label: v.label, values: { events: v.n } })),
  };
}

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------

function emptyValues(metrics: MetricDef[]): Values {
  const v: Values = {};
  for (const m of metrics) v[m.key] = m.ratio ? null : 0;
  return v;
}

export type CompareOptions = PeriodOptions & { category: CategoryId; by?: string | null };

export async function buildComparison(o: CompareOptions): Promise<CompareResponse> {
  const cat = getCategory(o.category);
  if (!cat) throw new Error("unknown category");

  const { a, b, note } = resolvePeriods(o);
  const by = o.by && cat.breakdowns?.some((x) => x.value === o.by) ? o.by : cat.breakdowns?.[0]?.value ?? "";

  const fetchRange = (from: string, to: string): Promise<RangeResult> => {
    switch (cat.id) {
      case "financial":
        return financialRange(from, to);
      case "caa":
        return caaRange(from, to, by);
      case "drivers":
        return driversRange(from, to);
      case "trucks":
        return trucksRange(from, to);
      case "safety":
        return safetyRange(from, to, by);
    }
  };

  let ra: RangeResult;
  let rb: RangeResult;
  try {
    [ra, rb] = await Promise.all([fetchRange(a.from, a.to), fetchRange(b.from, b.to)]);
  } catch (e) {
    if (e instanceof NotConnected) {
      return {
        category: cat.id,
        connected: false,
        reason: "Samsara isn't connected yet — add the SAMSARA_API_TOKEN in Vercel to see behaviour comparisons.",
        periodA: a,
        periodB: b,
        note,
        notes: [],
        totals: { a: {}, b: {} },
        rows: [],
      };
    }
    throw e;
  }

  const blank = emptyValues(cat.metrics);
  const keys = new Map<string, string>();
  const mapA = new Map(ra.rows.map((r) => [r.key, r]));
  const mapB = new Map(rb.rows.map((r) => [r.key, r]));
  for (const r of [...ra.rows, ...rb.rows]) keys.set(r.key, r.label);

  const rows: CompareRow[] = [...keys.entries()].map(([key, label]) => ({
    key,
    label,
    a: mapA.get(key)?.values ?? { ...blank },
    b: mapB.get(key)?.values ?? { ...blank },
  }));
  rows.sort((x, y) => num(y.a[cat.metrics[1]?.key ?? cat.metrics[0].key]) - num(x.a[cat.metrics[1]?.key ?? cat.metrics[0].key]));

  return {
    category: cat.id,
    connected: true,
    periodA: a,
    periodB: b,
    note,
    notes: [...(ra.notes ?? []), ...(rb.notes ?? [])].filter((n, i, arr) => arr.indexOf(n) === i),
    totals: { a: ra.totals, b: rb.totals },
    rows,
  };
}

// ---------------------------------------------------------------------------
// Trend — the last N weeks / months / quarters / years, side by side
// ---------------------------------------------------------------------------

const TREND_POINTS: Record<Fixed, number> = { week: 12, month: 12, quarter: 8, year: 5 };

function trendLabel(type: Fixed, start: Date): string {
  if (type === "week") return format(start, "MMM d");
  if (type === "month") return format(start, "MMM 'yy");
  if (type === "quarter") return `Q${Math.floor(start.getMonth() / 3) + 1} '${format(start, "yy")}`;
  return format(start, "yyyy");
}

export async function buildTrend(category: CategoryId, type: Fixed, points?: number): Promise<TrendResponse> {
  const cat = getCategory(category);
  if (!cat || !cat.hasTrend) throw new Error("trend not available for this category");

  const n = Math.min(Math.max(points ?? TREND_POINTS[type], 2), 60);
  const today = parseISO(torontoToday());

  // Build the full list of buckets (oldest first) so quiet periods show as zero, not as gaps.
  const buckets: { start: Date; end: Date }[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const [s, e] = bounds(type, shiftBack(type, today, i));
    buckets.push({ start: s, end: e });
  }
  const first = iso(buckets[0].start);

  let rows: any[];
  if (category === "financial") {
    rows = await query(
      `${COMBINED_CTE}
       SELECT to_char(date_trunc($1, d), 'YYYY-MM-DD') AS bucket,
              COALESCE(SUM(CASE WHEN kind = 'revenue' THEN amount ELSE 0 END), 0) AS revenue,
              COALESCE(SUM(CASE WHEN kind = 'cost' THEN amount ELSE 0 END), 0) AS cost
       FROM combined WHERE d >= $2 GROUP BY 1`,
      [type, first]
    );
  } else {
    rows = await query(
      `SELECT to_char(date_trunc($1, receive_date), 'YYYY-MM-DD') AS bucket, ${CAA_AGG}
       FROM tow_calls WHERE receive_date >= $2 GROUP BY 1`,
      [type, first]
    );
  }
  const byBucket = new Map(rows.map((r) => [r.bucket as string, r]));

  const out: TrendBucket[] = buckets.map(({ start, end }) => {
    const r = byBucket.get(iso(start));
    const values: Values =
      category === "financial"
        ? finValues(num(r?.revenue), num(r?.cost))
        : r
        ? caaValues(r)
        : caaValues({});
    return { start: iso(start), end: iso(end), label: trendLabel(type, start), partial: end > today, values };
  });

  return { category, granularity: type, buckets: out };
}
