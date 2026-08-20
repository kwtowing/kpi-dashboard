import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";


export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limit = Number(searchParams.get("limit") ?? 50);

  try {
    const rows = await query(
      `SELECT t.id, t.entry_date, t.kind, t.category, t.amount, t.currency, t.notes,
              ds.name as source_name
       FROM transactions t
       LEFT JOIN data_sources ds ON ds.id = t.source_id
       ORDER BY t.entry_date DESC, t.id DESC
       LIMIT $1`,
      [limit]
    );
    return NextResponse.json({ transactions: rows });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { entry_date, kind, category, amount, currency, notes } = body;

    if (!entry_date || !kind || !category || amount === undefined) {
      return NextResponse.json(
        { error: "entry_date, kind, category and amount are required" },
        { status: 400 }
      );
    }
    if (!["revenue", "cost"].includes(kind)) {
      return NextResponse.json(
        { error: "kind must be 'revenue' or 'cost'" },
        { status: 400 }
      );
    }

    const manualSource = await query<{ id: number }>(
      `SELECT id FROM data_sources WHERE type = 'manual' LIMIT 1`
    );
    const sourceId = manualSource[0]?.id ?? null;

    const rows = await query(
      `INSERT INTO transactions (source_id, entry_date, kind, category, amount, currency, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [sourceId, entry_date, kind, category, amount, currency ?? "USD", notes ?? null]
    );

    return NextResponse.json({ ok: true, id: rows[0]?.id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
