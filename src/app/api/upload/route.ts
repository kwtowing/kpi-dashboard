import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";


interface Row {
  entry_date: string;
  kind: "revenue" | "cost";
  category: string;
  amount: number;
  currency?: string;
  notes?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { rows, sourceName } = body as { rows: Row[]; sourceName?: string };

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: "No rows to import" }, { status: 400 });
    }

    const name = sourceName?.trim() || "CSV Import";
    const existing = await query<{ id: number }>(
      `SELECT id FROM data_sources WHERE name = $1 LIMIT 1`,
      [name]
    );
    let sourceId = existing[0]?.id;
    if (!sourceId) {
      const created = await query<{ id: number }>(
        `INSERT INTO data_sources (name, type) VALUES ($1, 'csv') RETURNING id`,
        [name]
      );
      sourceId = created[0].id;
    }

    let inserted = 0;
    const errors: string[] = [];

    for (const [i, row] of rows.entries()) {
      if (!row.entry_date || !row.kind || !row.category || row.amount === undefined || row.amount === null) {
        errors.push(`Row ${i + 1}: missing required field`);
        continue;
      }
      if (!["revenue", "cost"].includes(row.kind)) {
        errors.push(`Row ${i + 1}: kind must be 'revenue' or 'cost'`);
        continue;
      }
      await query(
        `INSERT INTO transactions (source_id, entry_date, kind, category, amount, currency, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [sourceId, row.entry_date, row.kind, row.category, row.amount, row.currency ?? "CAD", row.notes ?? null]
      );
      inserted++;
    }

    return NextResponse.json({ ok: true, inserted, errors });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
