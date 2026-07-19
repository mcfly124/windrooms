import { addDays } from "./dates";

/**
 * Standby rules, kept free of prisma/email imports so both the server actions
 * and the calendar client component can use them.
 */

/** A standby stay must be resolved this many days before check-in. */
export const STANDBY_DECISION_DAYS = 7;

/** Reminders go out this many days before check-in — a heads-up, then the deadline. */
export const STANDBY_REMINDER_DAYS = [8, STANDBY_DECISION_DAYS];

/** The date by which someone has to confirm or re-house a standby guest. */
export function standbyDecisionDate(checkIn: string): string {
  return addDays(checkIn, -STANDBY_DECISION_DAYS);
}

/** Standby this close to check-in (or past it) gets red, priority treatment. */
export function isStandbyUrgent(today: string, checkIn: string): boolean {
  return daysUntil(today, checkIn) <= STANDBY_DECISION_DAYS;
}

/** Days from today until check-in — negative once check-in has passed. */
export function daysUntil(today: string, checkIn: string): number {
  return Math.round(
    (new Date(`${checkIn}T00:00:00.000Z`).getTime() - new Date(`${today}T00:00:00.000Z`).getTime()) / 86400000
  );
}
