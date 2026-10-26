import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

const EXTRA_COLUMNS: [string, string][] = [
  ["sp_dt", "TIMESTAMPTZ"], ["as_dt", "TIMESTAMPTZ"], ["di_dt", "TIMESTAMPTZ"], ["er_dt", "TIMESTAMPTZ"],
  ["ol_dt", "TIMESTAMPTZ"], ["tw_dt", "TIMESTAMPTZ"], ["hs_dt", "TIMESTAMPTZ"],
  ["car_year", "TEXT"], ["make", "TEXT"], ["model", "TEXT"], ["facility_name", "TEXT"], ["priority", "TEXT"],
  ["bl_address", "TEXT"], ["bl_city", "TEXT"], ["tow_address", "TEXT"], ["tow_city", "TEXT"],
  ["member_type", "TEXT"], ["clear_reason", "TEXT"], ["tw_mileage", "NUMERIC(10, 2)"], ["raw", "JSONB"],
];

// Columns written for every call, in order. One list drives both the INSERT and the update.
const FIELDS = [
  "re_dt", "sp_dt", "as_dt", "di_dt", "er_dt", "ol_dt", "tw_dt", "cl_dt", "hs_dt",
  "call_status", "pta_wait", "garage", "truck", "driver_id", "trouble_cd", "club_code",
  "car_year", "make", "model", "facility_name", "priority", "bl_address", "bl_city",
  "tow_address", "tow_city", "member_type", "clear_reason", "om_mileage", "tw_mileage",
  "subtotal", "tax", "total_cost", "towed_kms_paid", "towed_kms", "raw",
] as const;

import type { CaaRow } from "@/lib/caaParser";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const rows = body.rows as CaaRow[];

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: "No rows to import" }, { status: 400 });
    }

    // Make sure the extra capture columns exist (safe to run every time).
    for (const [col, type] of EXTRA_COLUMNS) {
      await query(`ALTER TABLE tow_calls ADD COLUMN IF NOT EXISTS ${col} ${type}`);
    }

    const sourceName = "CAA Garage Productivity";
    const existing = await query<{ id: number }>(
      `SELECT id FROM data_sources WHERE name = $1 LIMIT 1`,
      [sourceName]
    );
    let sourceId = existing[0]?.id;
    if (!sourceId) {
      const created = await query<{ id: number }>(
        `INSERT INTO data_sources (name, type) VALUES ($1, 'csv') RETURNING id`,
        [sourceName]
      );
      sourceId = created[0].id;
    }

    let inserted = 0;
    let updated = 0;
    const errors: string[] = [];

    for (const [i, r] of rows.entries()) {
      if (!r.receive_date || !r.call_no) {
        errors.push(`Row ${i + 1}: missing date or call number`);
        continue;
      }

      // Upsert: a call seen again (same call_no + receive_date) has its values
      // refreshed rather than skipped — CAA reports get amended, and a later
      // export with a corrected amount should actually update our numbers.
      const cols = ["source_id", "call_no", "receive_date", ...FIELDS];
      const values = [
        sourceId,
        r.call_no,
        r.receive_date,
        ...FIELDS.map((f) => (f === "raw" ? JSON.stringify(r.raw ?? {}) : (r as any)[f] ?? null)),
      ];
      const placeholders = cols.map((c, k) => (c === "raw" ? `$${k + 1}::jsonb` : `$${k + 1}`));
      const result = await query<{ inserted_new: boolean }>(
        `INSERT INTO tow_calls (${cols.join(", ")})
         VALUES (${placeholders.join(", ")})
         ON CONFLICT (call_no, receive_date) DO UPDATE SET
           source_id = EXCLUDED.source_id,
           ${FIELDS.map((f) => `${f} = EXCLUDED.${f}`).join(",\n           ")}
         RETURNING (xmax = 0) AS inserted_new`,
        values
      );

      if (result[0]?.inserted_new) {
        inserted++;
      } else {
        updated++;
      }

      if (r.driver_id) {
        await query(
          `INSERT INTO driver_master (driver_id) VALUES ($1) ON CONFLICT (driver_id) DO NOTHING`,
          [r.driver_id]
        );
      }
      if (r.truck) {
        await query(
          `INSERT INTO truck_master (truck_number) VALUES ($1) ON CONFLICT (truck_number) DO NOTHING`,
          [r.truck]
        );
      }
    }

    // Reconcile: what the database now holds for the dates in this file, so the
    // figures can be compared with the file's own totals.
    const days = rows.map((r) => r.receive_date).sort();
    const check = await query<{ calls: string; total: string; zero: string }>(
      `SELECT COUNT(*) AS calls, COALESCE(SUM(total_cost), 0) AS total,
              COUNT(*) FILTER (WHERE total_cost = 0) AS zero
       FROM tow_calls WHERE receive_date >= $1 AND receive_date <= $2`,
      [days[0], days[days.length - 1]]
    );
    const database = {
      from: days[0],
      to: days[days.length - 1],
      calls: Number(check[0].calls),
      total: Number(check[0].total),
      zeroDollar: Number(check[0].zero),
    };

    return NextResponse.json({ ok: true, inserted, updated, errors, database });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
