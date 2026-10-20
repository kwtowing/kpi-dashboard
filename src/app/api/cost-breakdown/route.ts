import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { COMBINED_CTE } from "@/lib/combined";

export const dynamic = "force-dynamic";

const PERIODS = ["day", "week", "month", "year"];

// Full cost picture for the Executive Dashboard: every cost category, plus
// driver labour broken out by driver and by truck.
//
// Scope matches the old Cost breakdown card: the chosen date range if one is
// set, otherwise the current period (e.g. this month).
//
// Truck costs: the only costs the system can tie to a truck are driver labour
// costs, which follow the calls each driver ran in that truck. Hourly drivers
// are exact (each call's hours x rate goes to that call's truck). Salaried
// drivers' daily cost is split across the trucks they ran that day, in
// proportion to calls. Manual / CSV cost entries (fuel, insurance, etc.) carry
// no driver or truck, so they are reported as company-level costs.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const period = searchParams.get("period") ?? "month";
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const hasRange = Boolean(from && to);

  if (!PERIODS.includes(period)) {
    return NextResponse.json({ error: "invalid period" }, { status: 400 });
  }

  const params = hasRange ? [from, to] : [period];
  const scope = (col: string) =>
    hasRange ? `${col} >= $1 AND ${col} <= $2` : `${col} >= date_trunc($1, now())`;

  try {
    const categories = await query(
      `${COMBINED_CTE}
       SELECT category,
              SUM(amount) AS amount,
              BOOL_OR(driver_id IS NOT NULL) AS driver_linked
       FROM combined
       WHERE kind = 'cost' AND ${scope("d")}
       GROUP BY category
       ORDER BY amount DESC`,
      params
    );

    const drivers = await query(
      `${COMBINED_CTE}
       , labour AS (
         SELECT driver_id, SUM(amount) AS cost
         FROM combined
         WHERE kind = 'cost' AND driver_id IS NOT NULL AND ${scope("d")}
         GROUP BY driver_id
       ), calls AS (
         SELECT driver_id::text AS driver_id,
                COUNT(*) AS calls,
                COALESCE(SUM(total_cost), 0) AS revenue,
                COALESCE(SUM(towed_kms_paid), 0) AS km_paid
         FROM tow_calls
         WHERE driver_id IS NOT NULL AND ${scope("receive_date")}
         GROUP BY driver_id
       )
       SELECT COALESCE(l.driver_id, c.driver_id) AS driver_id,
              dm.driver_name,
              COALESCE(l.cost, 0) AS cost,
              COALESCE(c.calls, 0) AS calls,
              COALESCE(c.revenue, 0) AS revenue,
              COALESCE(c.km_paid, 0) AS km_paid
       FROM labour l
       FULL JOIN calls c ON c.driver_id = l.driver_id
       LEFT JOIN driver_master dm ON dm.driver_id = COALESCE(l.driver_id, c.driver_id)
       ORDER BY cost DESC`,
      params
    );

    const trucks = await query(
      `WITH truck_cost AS (
         SELECT tc.truck, tc.receive_date AS d,
                (EXTRACT(EPOCH FROM (tc.cl_dt - tc.re_dt)) / 3600.0) * dm.hourly_rate AS amount
         FROM tow_calls tc
         JOIN driver_master dm ON dm.driver_id = tc.driver_id
         WHERE dm.compensation_type = 'hourly' AND dm.hourly_rate IS NOT NULL
           AND tc.re_dt IS NOT NULL AND tc.cl_dt IS NOT NULL AND tc.cl_dt > tc.re_dt

         UNION ALL
         SELECT x.truck, x.receive_date AS d,
                dm.monthly_salary / ad.active_days * x.n_truck / x.n_day AS amount
         FROM (
           SELECT driver_id, receive_date, truck,
                  COUNT(*)::numeric AS n_truck,
                  SUM(COUNT(*)) OVER (PARTITION BY driver_id, receive_date)::numeric AS n_day
           FROM tow_calls
           WHERE driver_id IS NOT NULL
           GROUP BY driver_id, receive_date, truck
         ) x
         JOIN driver_master dm ON dm.driver_id = x.driver_id
           AND dm.compensation_type = 'salary' AND dm.monthly_salary IS NOT NULL
         JOIN (
           SELECT driver_id, receive_date,
                  COUNT(*) OVER (PARTITION BY driver_id, date_trunc('month', receive_date))::numeric AS active_days
           FROM (SELECT DISTINCT driver_id, receive_date FROM tow_calls WHERE driver_id IS NOT NULL) y
         ) ad ON ad.driver_id = x.driver_id AND ad.receive_date = x.receive_date
       ), cost AS (
         SELECT COALESCE(truck, '') AS truck, SUM(amount) AS cost
         FROM truck_cost
         WHERE ${scope("d")}
         GROUP BY COALESCE(truck, '')
       ), calls AS (
         SELECT COALESCE(truck, '') AS truck,
                COUNT(*) AS calls,
                COUNT(DISTINCT driver_id) AS drivers,
                COALESCE(SUM(total_cost), 0) AS revenue,
                COALESCE(SUM(towed_kms_paid), 0) AS km_paid
         FROM tow_calls
         WHERE ${scope("receive_date")}
         GROUP BY COALESCE(truck, '')
       )
       -- A missing truck is grouped as '' so the two sides can be joined.
       SELECT COALESCE(co.truck, ca.truck) AS truck,
              COALESCE(co.cost, 0) AS cost,
              COALESCE(ca.calls, 0) AS calls,
              COALESCE(ca.drivers, 0) AS drivers,
              COALESCE(ca.revenue, 0) AS revenue,
              COALESCE(ca.km_paid, 0) AS km_paid
       FROM cost co
       FULL JOIN calls ca ON ca.truck = co.truck
       ORDER BY cost DESC`,
      params
    );

    const num = (v: any) => Number(v ?? 0);
    return NextResponse.json({
      period,
      range: hasRange ? { from, to } : null,
      categories: categories.map((c: any) => ({
        category: c.category,
        amount: num(c.amount),
        driverLinked: Boolean(c.driver_linked),
      })),
      drivers: drivers.map((d: any) => ({
        driverId: d.driver_id,
        name: d.driver_name || null,
        cost: num(d.cost),
        calls: num(d.calls),
        revenue: num(d.revenue),
        kmPaid: num(d.km_paid),
      })),
      trucks: trucks.map((t: any) => ({
        truck: t.truck || null,
        cost: num(t.cost),
        calls: num(t.calls),
        drivers: num(t.drivers),
        revenue: num(t.revenue),
        kmPaid: num(t.km_paid),
      })),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
