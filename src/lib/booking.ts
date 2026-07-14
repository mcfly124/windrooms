import { createHmac } from "crypto";
import { prisma } from "./db";
import { addDays, eachDay, nightsBetween, parseYmd, todayYmd, ymd } from "./dates";
import type { OverrideState, Prisma } from "@prisma/client";

export const MAX_PUBLIC_NIGHTS = 21;

/**
 * A room-day is open to the public when:
 * - a planner override says OPEN, or
 * - there is no override and the day falls inside the location's release window
 *   (releaseWindowDays, 0 = always open).
 * A CLOSED override always wins over the window default.
 */
export function dayOpenToPublic(
  day: string,
  releaseWindowDays: number,
  override: OverrideState | undefined
): boolean {
  if (override) return override === "OPEN";
  if (releaseWindowDays <= 0) return true;
  return day <= addDays(todayYmd(), releaseWindowDays);
}

export function validStayDates(checkIn: string, checkOut: string): string | null {
  const re = /^\d{4}-\d{2}-\d{2}$/;
  if (!re.test(checkIn) || !re.test(checkOut)) return "Invalid dates";
  const nights = nightsBetween(checkIn, checkOut);
  if (checkIn < todayYmd()) return "Check-in cannot be in the past";
  if (nights < 1) return "Check-out must be after check-in";
  if (nights > MAX_PUBLIC_NIGHTS) return `Stays are limited to ${MAX_PUBLIC_NIGHTS} nights`;
  return null;
}

/** Every night of [checkIn, checkOut) must be open for the room. */
export async function stayOpenForRoom(
  tx: Prisma.TransactionClient | typeof prisma,
  roomId: number,
  checkIn: string,
  checkOut: string,
  releaseWindowDays: number
): Promise<boolean> {
  const overrides = await tx.publicOverride.findMany({
    where: { roomId, date: { gte: parseYmd(checkIn), lt: parseYmd(checkOut) } },
  });
  const byDay = new Map(overrides.map((o) => [ymd(o.date), o.state]));
  const nights = nightsBetween(checkIn, checkOut);
  return eachDay(checkIn, nights).every((d) => dayOpenToPublic(d, releaseWindowDays, byDay.get(d)));
}

export async function publicAvailableRooms(locationSlug: string, checkIn: string, checkOut: string) {
  const location = await prisma.location.findUnique({
    where: { slug: locationSlug },
    include: {
      rooms: {
        where: { active: true, pricePln: { not: null } },
        orderBy: { name: "asc" },
        include: {
          reservations: {
            where: {
              status: "CONFIRMED",
              checkIn: { lt: parseYmd(checkOut) },
              checkOut: { gt: parseYmd(checkIn) },
            },
            select: { id: true },
          },
          publicOverrides: {
            where: { date: { gte: parseYmd(checkIn), lt: parseYmd(checkOut) } },
          },
        },
      },
    },
  });
  if (!location || !location.active || !location.publicBookingEnabled) return null;

  const nights = nightsBetween(checkIn, checkOut);
  const stayDays = eachDay(checkIn, nights);
  const rooms = location.rooms.filter((room) => {
    if (room.reservations.length > 0) return false;
    const byDay = new Map(room.publicOverrides.map((o) => [ymd(o.date), o.state]));
    return stayDays.every((d) => dayOpenToPublic(d, location.releaseWindowDays, byDay.get(d)));
  });
  // anyWindowOpen: whether at least one room fails only because of the window (for messaging)
  const anyBlockedByWindow =
    rooms.length === 0 &&
    location.rooms.some((room) => room.reservations.length === 0) &&
    location.releaseWindowDays > 0 &&
    checkOut > addDays(todayYmd(), location.releaseWindowDays + 1);
  return { location, rooms, anyBlockedByWindow };
}

export function bookingRef(reservationId: number): string {
  return `FR-${String(reservationId).padStart(5, "0")}`;
}

/** Unguessable confirmation token so booking pages can't be enumerated. */
export function bookingSig(reservationId: number): string {
  const secret = process.env.AUTH_SECRET ?? "";
  return createHmac("sha256", secret).update(`public-booking.${reservationId}`).digest("hex").slice(0, 24);
}

/** Signed token for public payment-link pages. */
export function payLinkSig(paymentId: number): string {
  const secret = process.env.AUTH_SECRET ?? "";
  return createHmac("sha256", secret).update(`pay-link.${paymentId}`).digest("hex").slice(0, 24);
}

export function payLinkPath(paymentId: number): string {
  return `/pay/${paymentId}?sig=${payLinkSig(paymentId)}`;
}
