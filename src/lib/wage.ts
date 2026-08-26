// Converts between monthly, weekly, daily, and hourly wage figures, given
// each driver's actual working pattern (hours/day, days/week). Used both
// server-side (labour cost calculations) and client-side (Administration's
// live breakdown display), so the math is identical everywhere.

const WEEKS_PER_MONTH = 52.1786 / 12; // average weeks in a month

export interface WageBreakdown {
  monthly: number;
  weekly: number;
  daily: number;
  hourly: number;
}

export function wageFromMonthly(monthly: number, hoursPerDay: number, daysPerWeek: number): WageBreakdown {
  const weekly = monthly / WEEKS_PER_MONTH;
  const daily = daysPerWeek > 0 ? weekly / daysPerWeek : 0;
  const hourly = hoursPerDay > 0 ? daily / hoursPerDay : 0;
  return { monthly, weekly, daily, hourly };
}

export function wageFromHourly(hourly: number, hoursPerDay: number, daysPerWeek: number): WageBreakdown {
  const daily = hourly * hoursPerDay;
  const weekly = daily * daysPerWeek;
  const monthly = weekly * WEEKS_PER_MONTH;
  return { monthly, weekly, daily, hourly };
}

export function wageBreakdown(
  compensationType: string,
  hourlyRate: number | null,
  monthlySalary: number | null,
  hoursPerDay: number,
  daysPerWeek: number
): WageBreakdown | null {
  if (compensationType === "salary" && monthlySalary !== null) {
    return wageFromMonthly(monthlySalary, hoursPerDay, daysPerWeek);
  }
  if (compensationType === "hourly" && hourlyRate !== null) {
    return wageFromHourly(hourlyRate, hoursPerDay, daysPerWeek);
  }
  return null;
}
