import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const driverId = searchParams.get("driver_id");

  try {
    const trucks = driverId
      ? await query<{ truck: string }>(
          `SELECT DISTINCT truck FROM tow_calls WHERE driver_id = $1 AND truck IS NOT NULL ORDER BY truck`,
          [driverId]
        )
      : await query<{ truck: string }>(`SELECT DISTINCT truck FROM tow_calls WHERE truck IS NOT NULL ORDER BY truck`);

    const troubleCodes = driverId
      ? await query<{ trouble_cd: string }>(
          `SELECT DISTINCT trouble_cd FROM tow_calls WHERE driver_id = $1 AND trouble_cd IS NOT NULL ORDER BY trouble_cd`,
          [driverId]
        )
      : await query<{ trouble_cd: string }>(
          `SELECT DISTINCT trouble_cd FROM tow_calls WHERE trouble_cd IS NOT NULL ORDER BY trouble_cd`
        );

    return NextResponse.json({
      trucks: trucks.map((t) => t.truck),
      troubleCodes: troubleCodes.map((t) => t.trouble_cd),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
