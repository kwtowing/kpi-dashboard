import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

// Hierarchical drill-down: Year -> Month -> Week -> Day -> Driver -> Truck -> Call.
// The presence of each successive param (year, month, week, day, driver, truck)
// determines how deep we are and what the *next* level's rows should show.

function baseFilters(payment: string | null, troubleCd: string | null) {
  const conditions: string[] = [];
  const params: any[] = [];
  if (troubleCd) {
    params.push(troubleCd);
    conditions.push(`trouble_cd = $${params.length}`);
  }
  if (payment === "paid") conditions.push(`total_cost > 0`);
  if (payment === "zero") conditions.push(`total_cost = 0`);
  return { conditions, params };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const year = searchParams.get("year");
  const month = searchParams.get("month");
  const week = searchParams.get("week");
  const day = searchParams.get("day");
  const driver = searchParams.get("driver");
  const truck = searchParams.get("truck");
  const payment = searchParams.get("payment");
  const troubleCd = searchParams.get("trouble_cd");

  const { conditions: filterConds, params: filterParams } = baseFilters(payment, troubleCd);

  try {
    // ---- Level: individual calls (year..truck all set) ----
    if (year && month && week && day && driver && truck) {
      const conditions = [...filterConds, `receive_date = $${filterParams.length + 1}`, `driver_id = $${filterParams.length + 2}`, `truck = $${filterParams.length + 3}`];
      const params = [...filterParams, day, driver, truck];
      const calls = await query(
        `SELECT id, call_no, receive_date, garage, trouble_cd, call_status,
                towed_kms_paid, towed_kms, subtotal, tax, total_cost
         FROM tow_calls WHERE ${conditions.join(" AND ")}
         ORDER BY receive_date DESC`,
        params
      );
      return NextResponse.json({ level: "call", rows: calls });
    }

    // ---- Level: trucks (year..driver set, need truck breakdown) ----
    if (year && month && week && day && driver) {
      const conditions = [...filterConds, `receive_date = $${filterParams.length + 1}`, `driver_id = $${filterParams.length + 2}`, `truck IS NOT NULL`];
      const params = [...filterParams, day, driver];
      const rows = await query(
        `SELECT truck AS label, COUNT(*) AS calls, COALESCE(SUM(total_cost),0) AS revenue,
                COALESCE(SUM(towed_kms_paid),0) AS km_paid, COUNT(*) FILTER (WHERE total_cost = 0) AS zero_paid
         FROM tow_calls WHERE ${conditions.join(" AND ")}
         GROUP BY truck ORDER BY revenue DESC`,
        params
      );
      return NextResponse.json({ level: "truck", rows });
    }

    // ---- Level: drivers (year..day set) ----
    if (year && month && week && day) {
      const conditions = [...filterConds, `receive_date = $${filterParams.length + 1}`, `driver_id IS NOT NULL`];
      const params = [...filterParams, day];
      const rows = await query(
        `SELECT driver_id AS label, COUNT(*) AS calls, COALESCE(SUM(total_cost),0) AS revenue,
                COALESCE(SUM(towed_kms_paid),0) AS km_paid, COUNT(*) FILTER (WHERE total_cost = 0) AS zero_paid
         FROM tow_calls WHERE ${conditions.join(" AND ")}
         GROUP BY driver_id ORDER BY revenue DESC`,
        params
      );
      return NextResponse.json({ level: "driver", rows });
    }

    // ---- Level: days (year, month, week set) ----
    if (year && month && week) {
      const conditions = [...filterConds, `date_trunc('week', receive_date) = $${filterParams.length + 1}::date`];
      const params = [...filterParams, week];
      const rows = await query(
        `SELECT receive_date AS label, COUNT(*) AS calls, COALESCE(SUM(total_cost),0) AS revenue,
                COALESCE(SUM(towed_kms_paid),0) AS km_paid, COUNT(*) FILTER (WHERE total_cost = 0) AS zero_paid
         FROM tow_calls WHERE ${conditions.join(" AND ")}
         GROUP BY receive_date ORDER BY receive_date ASC`,
        params
      );
      return NextResponse.json({ level: "day", rows });
    }

    // ---- Level: weeks (year, month set) ----
    if (year && month) {
      const monthStart = `${year}-${month.padStart(2, "0")}-01`;
      const conditions = [
        ...filterConds,
        `receive_date >= $${filterParams.length + 1}::date`,
        `receive_date < ($${filterParams.length + 1}::date + interval '1 month')`,
      ];
      const params = [...filterParams, monthStart];
      const rows = await query(
        `SELECT date_trunc('week', receive_date) AS label, COUNT(*) AS calls, COALESCE(SUM(total_cost),0) AS revenue,
                COALESCE(SUM(towed_kms_paid),0) AS km_paid, COUNT(*) FILTER (WHERE total_cost = 0) AS zero_paid
         FROM tow_calls WHERE ${conditions.join(" AND ")}
         GROUP BY 1 ORDER BY 1 ASC`,
        params
      );
      return NextResponse.json({ level: "week", rows });
    }

    // ---- Level: months (year set) ----
    if (year) {
      const yearStart = `${year}-01-01`;
      const conditions = [
        ...filterConds,
        `receive_date >= $${filterParams.length + 1}::date`,
        `receive_date < ($${filterParams.length + 1}::date + interval '1 year')`,
      ];
      const params = [...filterParams, yearStart];
      const rows = await query(
        `SELECT date_trunc('month', receive_date) AS label, COUNT(*) AS calls, COALESCE(SUM(total_cost),0) AS revenue,
                COALESCE(SUM(towed_kms_paid),0) AS km_paid, COUNT(*) FILTER (WHERE total_cost = 0) AS zero_paid
         FROM tow_calls WHERE ${conditions.join(" AND ")}
         GROUP BY 1 ORDER BY 1 ASC`,
        params
      );
      return NextResponse.json({ level: "month", rows });
    }

    // ---- Top level: years ----
    {
      const conditions = filterConds.length > 0 ? filterConds : ["1=1"];
      const rows = await query(
        `SELECT date_trunc('year', receive_date) AS label, COUNT(*) AS calls, COALESCE(SUM(total_cost),0) AS revenue,
                COALESCE(SUM(towed_kms_paid),0) AS km_paid, COUNT(*) FILTER (WHERE total_cost = 0) AS zero_paid
         FROM tow_calls WHERE ${conditions.join(" AND ")}
         GROUP BY 1 ORDER BY 1 ASC`,
        filterParams
      );
      return NextResponse.json({ level: "year", rows });
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
