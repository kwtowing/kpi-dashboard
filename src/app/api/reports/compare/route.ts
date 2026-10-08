import { NextRequest, NextResponse } from "next/server";
import { buildComparison } from "@/lib/reports";
import { getCategory } from "@/lib/reportTypes";
import type { CompareMode, PeriodType } from "@/lib/reportTypes";

export const dynamic = "force-dynamic";

const TYPES: PeriodType[] = ["week", "month", "quarter", "year", "custom"];
const MODES: CompareMode[] = ["previous", "yoy", "custom"];

export async function GET(req: NextRequest) {
  const sp = new URL(req.url).searchParams;
  const category = sp.get("category") ?? "";
  const type = (sp.get("type") ?? "month") as PeriodType;
  const compare = (sp.get("compare") ?? "previous") as CompareMode;

  const cat = getCategory(category);
  if (!cat) return NextResponse.json({ error: "invalid category" }, { status: 400 });
  if (!TYPES.includes(type)) return NextResponse.json({ error: "invalid period type" }, { status: 400 });
  if (!MODES.includes(compare)) return NextResponse.json({ error: "invalid compare mode" }, { status: 400 });

  try {
    const result = await buildComparison({
      category: cat.id,
      type,
      compare,
      anchor: sp.get("anchor"),
      likeForLike: sp.get("likeForLike") !== "0",
      aFrom: sp.get("aFrom"),
      aTo: sp.get("aTo"),
      bFrom: sp.get("bFrom"),
      bTo: sp.get("bTo"),
      by: sp.get("by"),
    });
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
