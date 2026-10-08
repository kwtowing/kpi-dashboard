import { NextRequest, NextResponse } from "next/server";
import { buildTrend } from "@/lib/reports";
import { getCategory } from "@/lib/reportTypes";

export const dynamic = "force-dynamic";

const GRANULARITIES = ["week", "month", "quarter", "year"] as const;

export async function GET(req: NextRequest) {
  const sp = new URL(req.url).searchParams;
  const cat = getCategory(sp.get("category") ?? "");
  const granularity = (sp.get("granularity") ?? "month") as (typeof GRANULARITIES)[number];
  if (!cat || !cat.hasTrend) return NextResponse.json({ error: "invalid category" }, { status: 400 });
  if (!GRANULARITIES.includes(granularity)) return NextResponse.json({ error: "invalid granularity" }, { status: 400 });

  const points = sp.get("points") ? Number(sp.get("points")) : undefined;
  try {
    return NextResponse.json(await buildTrend(cat.id, granularity, Number.isFinite(points) ? points : undefined));
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
