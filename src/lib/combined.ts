// Shared by the Executive Dashboard (/api/kpis) and Reports (/api/reports), so both
// always agree on revenue and cost.
//
// A single combined view of every revenue/cost entry, regardless of source:
//   - Revenue: CAA calls (tow_calls.total_cost) plus manual/CSV revenue entries.
//   - Cost: manual/CSV cost entries, PLUS real driver labour cost computed
//     automatically from driver_master:
//       - Hourly drivers: each call's duration (RE DT -> CL DT) x hourly rate,
//         attributed to that call's date.
//       - Salaried drivers: their monthly salary, spread evenly across the
//         days they actually had calls that month (not a manual entry —
//         this is why "Total cost" now reflects real payroll instead of
//         staying at $0 for anyone who hasn't logged manual expenses).
// tow_calls is the live source of truth for CAA data, so a corrected
// re-import is reflected here immediately, no separate copy kept anywhere.
export const COMBINED_CTE = `
  WITH combined AS (
    SELECT entry_date AS d, kind, amount, category, NULL::text AS driver_id FROM transactions

    UNION ALL
    SELECT receive_date AS d, 'revenue' AS kind, total_cost AS amount, 'CAA Towing' AS category, driver_id::text AS driver_id
    FROM tow_calls WHERE total_cost IS NOT NULL

    UNION ALL
    SELECT tc.receive_date AS d, 'cost' AS kind,
           (EXTRACT(EPOCH FROM (tc.cl_dt - tc.re_dt)) / 3600.0) * dm.hourly_rate AS amount,
           'Driver labour' AS category, tc.driver_id::text AS driver_id
    FROM tow_calls tc
    JOIN driver_master dm ON dm.driver_id = tc.driver_id
    WHERE dm.compensation_type = 'hourly' AND dm.hourly_rate IS NOT NULL
      AND tc.re_dt IS NOT NULL AND tc.cl_dt IS NOT NULL AND tc.cl_dt > tc.re_dt

    UNION ALL
    SELECT ad.receive_date AS d, 'cost' AS kind,
           dm.monthly_salary / ad.active_days_in_month AS amount,
           'Driver labour' AS category, dm.driver_id::text AS driver_id
    FROM driver_master dm
    JOIN (
      SELECT driver_id, receive_date,
             COUNT(*) OVER (PARTITION BY driver_id, date_trunc('month', receive_date)) AS active_days_in_month
      FROM (SELECT DISTINCT driver_id, receive_date FROM tow_calls WHERE driver_id IS NOT NULL) x
    ) ad ON ad.driver_id = dm.driver_id
    WHERE dm.compensation_type = 'salary' AND dm.monthly_salary IS NOT NULL
  )
`;

