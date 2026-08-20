import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

const PERIODS = ["day", "week", "month"] as const;
type Period = (typeof PERIODS)[number];

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const period = (searchParams.get("period") ?? "day") as Period;
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  if (!PERIODS.includes(period)) {
    return NextResponse.json({ error: "invalid period" }, { status: 400 });
  }

  try {
    const rows =
      from && to
        ? await query(
            `SELECT
               driver_id,
               date_trunc($1, receive_date) AS bucket,
               COUNT(*) AS call_count,
               COALESCE(SUM(towed_kms_paid), 0) AS km_paid,
               COALESCE(SUM(total_cost), 0) AS total_cost,
               COUNT(*) FILTER (WHERE total_cost = 0) AS zero_value_count
             FROM tow_calls
             WHERE driver_id IS NOT NULL AND receive_date >= $2 AND receive_date <= $3
             GROUP BY driver_id, bucket
             ORDER BY bucket DESC, total_cost DESC`,
            [period, from, to]
          )
        : await query(
            `SELECT
               driver_id,
               date_trunc($1, receive_date) AS bucket,
               COUNT(*) AS call_count,
               COALESCE(SUM(towed_kms_paid), 0) AS km_paid,
               COALESCE(SUM(total_cost), 0) AS total_cost,
               COUNT(*) FILTER (WHERE total_cost = 0) AS zero_value_count
             FROM tow_calls
             WHERE driver_id IS NOT NULL
             GROUP BY driver_id, bucket
             ORDER BY bucket DESC, total_cost DESC`,
            [period]
          );

    const flaggedQuery = from && to
      ? await query<{ count: string }>(
          `SELECT COUNT(*) AS count FROM tow_calls WHERE total_cost = 0 AND receive_date >= $1 AND receive_date <= $2`,
          [from, to]
        )
      : null;

    return NextResponse.json({
      period,
      range: from && to ? { from, to } : null,
      rows,
      flaggedCountInRange: flaggedQuery ? Number(flaggedQuery[0].count) : null,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
