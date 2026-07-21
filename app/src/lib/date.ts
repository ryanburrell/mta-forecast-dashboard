import { DAY_OF_WEEK_LABELS } from "@/lib/types";

/** Formats a Date as YYYY-MM-DD in LOCAL time, for <input type="date"> value binding. */
export function toDateInputValue(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Parses an <input type="date"> value ("YYYY-MM-DD") as a LOCAL date.
 * `new Date("YYYY-MM-DD")` parses as UTC midnight, which shifts to the
 * previous day once converted to any timezone west of UTC - splitting the
 * parts and using the local-time Date constructor avoids that.
 */
export function parseDateInputValue(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Converts a Date's day-of-week to the ETL's convention (0=Monday..6=Sunday,
 * matching Python's date.weekday() - see etl/pull_mta_data.py). JS's
 * Date.getDay() is 0=Sunday..6=Saturday, so this is not a no-op.
 */
export function toModelDayOfWeek(date: Date): number {
  const jsDay = date.getDay(); // 0=Sunday..6=Saturday
  return (jsDay + 6) % 7;
}

export function dayOfWeekLabel(modelDayOfWeek: number): string {
  return DAY_OF_WEEK_LABELS[modelDayOfWeek];
}

/** The next date (today inclusive) that falls on the given JS-convention weekday (0=Sunday..6=Saturday). */
export function nextDateOnWeekday(fromDate: Date, jsWeekday: number): Date {
  const result = new Date(fromDate);
  const diff = (jsWeekday - result.getDay() + 7) % 7;
  result.setDate(result.getDate() + diff);
  return result;
}
