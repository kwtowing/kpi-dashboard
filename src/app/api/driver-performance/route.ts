import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

const AVG_DAYS_PER_MONTH = 30.4368; // 365.24 / 12

// Summary + call-level detail for one driver, with optional filters.
// Required: driver_id. Optional: from, to, truck, payment ('all' | 'paid' | 'zero'), trouble_cd.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const driverId = searchParams.get("driver_id");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const truck = searchParams.get("truck");
  const payment = searchParams.get("payment") ?? "all";
  const troubleCd = searchParams.get("trouble_cd");

  if (!driverId) {
    return NextResponse.json({ error: "driver_id is required" }, { status: 400 });
  }

  const conditions: string[] = ["driver_id = $1"];
  const params: any[] = [driverId];

  if (from && to) {
    params.push(from, to);
    conditions.push(`receive_date >= $${params.length - 1} AND receive_date <= $${params.length}`);
  }
  if (truck) {
    params.push(truck);
    conditions.push(`truck = $${params.length}`);
  }
  if (troubleCd) {
    params.push(troubleCd);
    conditions.push(`trouble_cd = $${params.length}`);
  }
  if (payment === "paid") {
    conditions.push(`total_cost > 0`);
  } else if (payment === "zero") {
    conditions.push(`total_cost = 0`);
  }

  const whereClause = conditions.join(" AND ");

  try {
    const summaryRows = await query(
      `SELECT
         COUNT(*) AS calls,
         COALESCE(SUM(total_cost), 0) AS revenue,
         COALESCE(SUM(towed_kms_paid), 0) AS km_paid,
         COALESCE(AVG(total_cost), 0) AS avg_revenue_per_call,
         COUNT(*) FILTER (WHERE total_cost = 0) AS zero_paid_calls,
         COUNT(DISTINCT truck) AS trucks_used,
         COALESCE(SUM(
           CASE WHEN re_dt IS NOT NULL AND cl_dt IS NOT NULL AND cl_dt > re_dt
             THEN EXTRACT(EPOCH FROM (cl_dt - re_dt)) / 3600.0
             ELSE 0 END
         ), 0) AS hours,
         (MAX(receive_date) - MIN(receive_date) + 1) AS span_days
       FROM tow_calls
       WHERE ${whereClause}`,
      params
    );

    const calls = await query(
      `SELECT id, call_no, receive_date, truck, garage, trouble_cd, call_status,
              pta_wait, om_mileage, towed_kms_paid, towed_kms, subtotal, tax, total_cost
       FROM tow_calls
       WHERE ${whereClause}
       ORDER BY receive_date DESC
       LIMIT 300`,
      params
    );

    const driverInfo = await query(
      `SELECT driver_name, hourly_rate, monthly_salary, compensation_type, samsara_driver_id
       FROM driver_master WHERE driver_id = $1`,
      [driverId]
    );

    const s = summaryRows[0] as any;
    const hours = Number(s.hours);
    const info = driverInfo[0];
    const isSalary = info?.compensation_type === "salary" && info?.monthly_salary !== null && info?.monthly_salary !== undefined;

    // When a date range is set, prorate salary to that exact range. Otherwise
    // prorate to the span between this driver's first and last matching call.
    const spanDays = from && to
      ? (new Date(to).getTime() - new Date(from).getTime()) / 86400000 + 1
      : Number(s.span_days) || 1;

    let labourCost: number | null = null;
    let rate: number | null = null;
    if (isSalary) {
      rate = Number(info.monthly_salary);
      labourCost = rate * (spanDays / AVG_DAYS_PER_MONTH);
    } else if (info?.hourly_rate !== null && info?.hourly_rate !== undefined) {
      rate = Number(info.hourly_rate);
      labourCost = hours * rate;
    }

    return NextResponse.json({
      driver_id: driverId,
      driver_name: info?.driver_name ?? null,
      filters: { from, to, truck, payment, trouble_cd: troubleCd },
      summary: {
        calls: Number(s.calls),
        revenue: Number(s.revenue),
        km_paid: Number(s.km_paid),
        avg_revenue_per_call: Number(s.avg_revenue_per_call),
        zero_paid_calls: Number(s.zero_paid_calls),
        trucks_used: Number(s.trucks_used),
        hours: Math.round(hours * 10) / 10,
        compensation_type: info?.compensation_type ?? "hourly",
        rate,
        labour_cost: labourCost !== null ? Math.round(labourCost * 100) / 100 : null,
      },
      calls,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
