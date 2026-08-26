import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

interface CaaRow {
  receive_date: string;
  call_no: string;
  re_dt?: string | null;
  cl_dt?: string | null;
  call_status?: string | null;
  pta_wait?: number | null;
  garage?: string | null;
  truck?: string | null;
  driver_id?: string | null;
  trouble_cd?: string | null;
  club_code?: string | null;
  om_mileage?: number | null;
  subtotal?: number | null;
  tax?: number | null;
  total_cost?: number | null;
  towed_kms_paid?: number | null;
  towed_kms?: number | null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const rows = body.rows as CaaRow[];

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: "No rows to import" }, { status: 400 });
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
      const result = await query<{ inserted_new: boolean }>(
        `INSERT INTO tow_calls
           (source_id, call_no, receive_date, re_dt, cl_dt, call_status, pta_wait,
            garage, truck, driver_id, trouble_cd, club_code, om_mileage,
            subtotal, tax, total_cost, towed_kms_paid, towed_kms)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
         ON CONFLICT (call_no, receive_date) DO UPDATE SET
           source_id = EXCLUDED.source_id,
           re_dt = EXCLUDED.re_dt,
           cl_dt = EXCLUDED.cl_dt,
           call_status = EXCLUDED.call_status,
           pta_wait = EXCLUDED.pta_wait,
           garage = EXCLUDED.garage,
           truck = EXCLUDED.truck,
           driver_id = EXCLUDED.driver_id,
           trouble_cd = EXCLUDED.trouble_cd,
           club_code = EXCLUDED.club_code,
           om_mileage = EXCLUDED.om_mileage,
           subtotal = EXCLUDED.subtotal,
           tax = EXCLUDED.tax,
           total_cost = EXCLUDED.total_cost,
           towed_kms_paid = EXCLUDED.towed_kms_paid,
           towed_kms = EXCLUDED.towed_kms
         RETURNING (xmax = 0) AS inserted_new`,
        [
          sourceId,
          r.call_no,
          r.receive_date,
          r.re_dt ?? null,
          r.cl_dt ?? null,
          r.call_status ?? null,
          r.pta_wait ?? null,
          r.garage ?? null,
          r.truck ?? null,
          r.driver_id ?? null,
          r.trouble_cd ?? null,
          r.club_code ?? null,
          r.om_mileage ?? null,
          r.subtotal ?? null,
          r.tax ?? null,
          r.total_cost ?? null,
          r.towed_kms_paid ?? null,
          r.towed_kms ?? null,
        ]
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

    return NextResponse.json({ ok: true, inserted, updated, errors });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
