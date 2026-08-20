import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import path from "path";
import { execRaw, query } from "@/lib/db";

export const dynamic = "force-dynamic";


export async function POST() {
  try {
    const sql = readFileSync(
      path.join(process.cwd(), "src/lib/schema.sql"),
      "utf-8"
    );
    await execRaw(sql);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err.message },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const result = await query<{ exists: string | null }>(
      `SELECT to_regclass('public.transactions') as exists`
    );
    return NextResponse.json({ ready: !!result[0]?.exists });
  } catch (err: any) {
    return NextResponse.json({ ready: false, error: err.message });
  }
}
