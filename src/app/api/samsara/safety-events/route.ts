import { NextRequest, NextResponse } from "next/server";
import { listSafetyEvents, SamsaraNotConfigured } from "@/lib/connectors/samsara";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  // Default to the last 7 days if no range given.
  const endTime = to ? new Date(`${to}T23:59:59Z`).toISOString() : new Date().toISOString();
  const startTime = from
    ? new Date(`${from}T00:00:00Z`).toISOString()
    : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  try {
    const driverRows = await query<{ driver_id: string; driver_name: string | null; samsara_driver_id: string }>(
      `SELECT driver_id, driver_name, samsara_driver_id FROM driver_master
       WHERE samsara_driver_id IS NOT NULL AND samsara_driver_id <> ''`
    );
    const samsaraIds = driverRows.map((d) => d.samsara_driver_id);
    const idToInternal = new Map(driverRows.map((d) => [d.samsara_driver_id, d]));

    const events = await listSafetyEvents(startTime, endTime, samsaraIds);

    const enriched = events.map((e) => {
      const internal = e.driverId ? idToInternal.get(e.driverId) : undefined;
      return {
        ...e,
        internalDriverId: internal?.driver_id ?? null,
        internalDriverName: internal?.driver_name ?? e.driverName,
      };
    });

    // Summary counts by behavior label and by driver, for quick scanning.
    const byLabel: Record<string, number> = {};
    const byDriver: Record<string, { name: string; count: number }> = {};
    for (const e of enriched) {
      for (const label of e.behaviorLabels.length > 0 ? e.behaviorLabels : ["Unspecified"]) {
        byLabel[label] = (byLabel[label] ?? 0) + 1;
      }
      const key = e.internalDriverId ?? e.driverId ?? "unknown";
      const name = e.internalDriverName ?? e.driverName ?? "Unknown driver";
      if (!byDriver[key]) byDriver[key] = { name, count: 0 };
      byDriver[key].count += 1;
    }

    return NextResponse.json({
      connected: true,
      range: { from: startTime, to: endTime },
      events: enriched,
      summary: {
        total: enriched.length,
        byLabel,
        byDriver,
      },
    });
  } catch (err: any) {
    if (err instanceof SamsaraNotConfigured) {
      return NextResponse.json({ connected: false, reason: "not_configured", events: [] });
    }
    return NextResponse.json(
      { connected: false, reason: "api_error", error: err.message, events: [] },
      { status: 200 }
    );
  }
}
