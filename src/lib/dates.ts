/** All dates in the app are handled as "YYYY-MM-DD" strings at UTC midnight. */

export function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function parseYmd(s: string): Date {
  return new Date(`${s}T00:00:00.000Z`);
}

/** "Today" for the business is always Europe/Warsaw, wherever the server or viewer is. */
export function todayYmd(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Warsaw" });
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
