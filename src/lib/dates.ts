/** All dates in the app are handled as "YYYY-MM-DD" strings at UTC midnight. */

export function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function parseYmd(s: string): Date {
  return new Date(`${s}T00:00:00.000Z`);
}

/**
 * "Today" for the business is always Europe/Warsaw, wherever the server or viewer is.
 * Built from formatToParts — locale-shortcut tricks (en-CA) return non-ISO strings
 * on some engines (Safari), which cascaded into Invalid Date crashes.
 */
export function todayYmd(): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Warsaw",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function addDays(s: string, days: number): string {
  const d = parseYmd(s);
  d.setUTCDate(d.getUTCDate() + days);
  return ymd(d);
}

export function nightsBetween(checkIn: string, checkOut: string): number {
  return Math.round((parseYmd(checkOut).getTime() - parseYmd(checkIn).getTime()) / 86400000);
}

export function eachDay(start: string, count: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i++) out.push(addDays(start, i));
  return out;
}
