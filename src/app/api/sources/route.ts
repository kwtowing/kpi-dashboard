import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";


export async function GET() {
  try {
    const sources = await query(
      `SELECT id, name, type, created_at FROM data_sources ORDER BY created_at DESC`
    );
    return NextResponse.json({ sources });
  } catch (err: any) {
    return NextResponse.json({ sources: [], error: err.message });
  }
}
