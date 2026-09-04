import { NextRequest, NextResponse } from "next/server";
import { evaluateAlerts } from "@/lib/alerts/evaluate";

export const dynamic = "force-dynamic";

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // no secret configured — open (e.g. local dev)
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

// Vercel Cron issues a GET request on schedule (see vercel.json). POST is
// for triggering an evaluation on demand from the Alerts admin UI.
export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const summary = await evaluateAlerts();
  return NextResponse.json(summary);
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const summary = await evaluateAlerts();
  return NextResponse.json(summary);
}
