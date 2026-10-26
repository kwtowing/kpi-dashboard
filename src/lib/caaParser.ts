// Reads the CAA "Garage Productivity Calls Details" export by COLUMN NAME, not by
// column position. CAA has added columns to this report before; reading by name
// means a layout change can no longer silently put the wrong numbers in the wrong
// field (that is what produced $0 calls and wrong totals).

export type CaaRow = {
  receive_date: string;
  call_no: string;
  call_status: string | null;
  garage: string | null;
  truck: string | null;
  driver_id: string | null;
  trouble_cd: string | null;
  club_code: string | null;
  re_dt: string | null;
  sp_dt: string | null;
  as_dt: string | null;
  di_dt: string | null;
  er_dt: string | null;
  ol_dt: string | null;
  tw_dt: string | null;
  cl_dt: string | null;
  hs_dt: string | null;
  pta_wait: number | null;
  car_year: string | null;
  make: string | null;
  model: string | null;
  facility_name: string | null;
  priority: string | null;
  bl_address: string | null;
  bl_city: string | null;
  tow_address: string | null;
  tow_city: string | null;
  member_type: string | null;
  clear_reason: string | null;
  om_mileage: number | null;
  tw_mileage: number | null;
  subtotal: number | null;
  tax: number | null;
  total_cost: number | null;
  towed_kms_paid: number | null;
  towed_kms: number | null;
  // Every column of the row, keyed by its header, so nothing in the report is lost
  // (all the individual charge columns, coordinates, codes, policy, etc.).
  raw: Record<string, string | number | null>;
};

export type ParseResult = {
  rows: CaaRow[];
  warnings: string[];
  summary: {
    calls: number;
    subtotal: number;
    tax: number;
    total: number;
    zeroDollar: number;
    earliest: string | null;
    latest: string | null;
    mismatched: number; // rows where subtotal + tax does not equal total
    columns: number;
  };
};

const norm = (s: unknown) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const HEADER_ALIASES: Record<string, string[]> = {
  receive_date: ["receive date"],
  call_no: ["call no", "call number", "call #"],
  call_status: ["call status"],
  garage: ["garage"],
  truck: ["truck"],
  driver_id: ["driver id"],
  trouble_cd: ["trouble cd", "trouble code"],
  club_code: ["club code"],
  re_dt: ["re dt"],
  sp_dt: ["sp dt"],
  as_dt: ["as dt"],
  di_dt: ["di dt"],
  er_dt: ["er dt"],
  ol_dt: ["ol dt"],
  tw_dt: ["tw dt"],
  cl_dt: ["cl dt"],
  hs_dt: ["hs dt"],
  pta_wait: ["pta wait"],
  car_year: ["car year"],
  make: ["make"],
  model: ["model"],
  facility_name: ["facility name"],
  priority: ["priority"],
  bl_address: ["bl address"],
  bl_city: ["bl city"],
  tow_address: ["tow address"],
  tow_city: ["tow city"],
  member_type: ["member type"],
  clear_reason: ["clear reason"],
  om_mileage: ["om mileage"],
  tw_mileage: ["tw mileage"],
  subtotal: ["subtotal", "sub total"],
  tax: ["tax"],
  total_cost: ["total cost"],
  towed_kms_paid: ["total towed kms paid", "total towed km paid"],
  towed_kms: ["total towed kms", "total towed km"],
};

const REQUIRED = ["receive_date", "call_no", "subtotal", "tax", "total_cost"];

// Excel stores dates as day-counts. Converting the number ourselves (instead of
// letting the browser build a Date) keeps the calendar day identical on any
// computer or time zone.
function serialToIso(n: number): string {
  const ms = Math.round((n - 25569) * 86400 * 1000 / 1000) * 1000;
  return new Date(ms).toISOString();
}

export function toIso(v: unknown): string | null {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v === "number" && Number.isFinite(v)) return serialToIso(v);
  if (v instanceof Date && !isNaN(v.getTime())) {
    const p = (x: number) => String(x).padStart(2, "0");
    return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}T${p(v.getHours())}:${p(v.getMinutes())}:${p(v.getSeconds())}.000Z`;
  }
  const s = String(v).trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}T${m[4] ?? "00"}:${m[5] ?? "00"}:${m[6] ?? "00"}.000Z`;
  return null;
}

const toDay = (v: unknown) => toIso(v)?.slice(0, 10) ?? null;

function toNum(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : null;
}

const toStr = (v: unknown): string | null => {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
};

const DATE_FIELDS = new Set(["re_dt", "sp_dt", "as_dt", "di_dt", "er_dt", "ol_dt", "tw_dt", "cl_dt", "hs_dt"]);
const NUM_FIELDS = new Set(["pta_wait", "om_mileage", "tw_mileage", "subtotal", "tax", "total_cost", "towed_kms_paid", "towed_kms"]);

export function parseCaaGrid(grid: unknown[][]): ParseResult {
  // Find the header row (the one containing "Receive Date" and "Call No").
  let headerIdx = -1;
  for (let i = 0; i < Math.min(grid.length, 15); i++) {
    const cells = (grid[i] ?? []).map(norm);
    if (cells.includes("receive date") && (cells.includes("call no") || cells.includes("call number"))) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) {
    throw new Error(
      "This doesn't look like a CAA Garage Productivity report — the header row (Receive Date, Call No…) wasn't found."
    );
  }
  const header = grid[headerIdx] ?? [];
  const col: Record<string, number> = {};
  header.forEach((h, idx) => {
    const key = norm(h);
    if (!key) return;
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      if (col[field] === undefined && aliases.includes(key)) col[field] = idx;
    }
  });
  const missing = REQUIRED.filter((f) => col[f] === undefined);
  if (missing.length) {
    throw new Error(
      "These columns are missing from the file, so nothing was imported: " +
        missing.map((m) => HEADER_ALIASES[m][0]).join(", ") +
        "."
    );
  }

  const warnings: string[] = [];
  const known = new Set(Object.values(col));
  const rows: CaaRow[] = [];
  let skipped = 0;
  for (let i = headerIdx + 1; i < grid.length; i++) {
    const r = grid[i];
    if (!r) continue;
    const callNo = toStr(r[col.call_no]);
    const day = toDay(r[col.receive_date]);
    if (!callNo || !day) {
      if (r.some((c) => c !== undefined && c !== null && c !== "")) skipped++;
      continue;
    }
    const row: any = { call_no: callNo, receive_date: day };
    for (const field of Object.keys(HEADER_ALIASES)) {
      if (field === "receive_date" || field === "call_no") continue;
      const v = col[field] === undefined ? undefined : r[col[field]];
      row[field] = DATE_FIELDS.has(field) ? toIso(v) : NUM_FIELDS.has(field) ? toNum(v) : toStr(v);
    }
    const raw: Record<string, string | number | null> = {};
    header.forEach((h, idx) => {
      const name = String(h ?? "").trim();
      const v = r[idx];
      if (!name || v === undefined || v === null || v === "") return;
      raw[name] = /(^|[ _])(dt|date|tm)$/i.test(name) ? toIso(v) ?? String(v) : typeof v === "number" ? v : String(v);
    });
    row.raw = raw;
    rows.push(row as CaaRow);
  }
  if (skipped) warnings.push(`${skipped} row(s) had no call number or date and were skipped.`);
  if (!rows.length) throw new Error("No data rows found in this file.");

  const sum = (f: (r: CaaRow) => number | null) =>
    Math.round(rows.reduce((a, r) => a + (f(r) ?? 0), 0) * 100) / 100;
  const days = rows.map((r) => r.receive_date).sort();
  const mismatched = rows.filter(
    (r) => r.total_cost !== null && Math.abs((r.subtotal ?? 0) + (r.tax ?? 0) - r.total_cost) > 0.011
  ).length;
  const summary = {
    calls: rows.length,
    subtotal: sum((r) => r.subtotal),
    tax: sum((r) => r.tax),
    total: sum((r) => r.total_cost),
    zeroDollar: rows.filter((r) => (r.total_cost ?? 0) === 0).length,
    earliest: days[0],
    latest: days[days.length - 1],
    mismatched,
    columns: header.filter((h) => String(h ?? "").trim() !== "").length,
  };
  if (mismatched) warnings.push(`${mismatched} call(s) where subtotal + tax does not equal total cost. Check the CAA report.`);
  const dupKeys = new Set<string>();
  let dups = 0;
  for (const r of rows) {
    const k = r.receive_date + "|" + r.call_no;
    if (dupKeys.has(k)) dups++;
    dupKeys.add(k);
  }
  if (dups) warnings.push(`${dups} repeated call number(s) on the same date inside this file. Only the last copy of each is kept.`);
  void known;
  return { rows, warnings, summary };
}
