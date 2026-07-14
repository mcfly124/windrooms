import { createHmac } from "crypto";
import { prisma } from "./db";
import { addDays, nightsBetween, parseYmd, todayYmd } from "./dates";

export const MAX_PUBLIC_NIGHTS = 21;

/**
 * Public availability rules for a stay [checkIn, checkOut) at a room:
 * - location is active with publicBookingEnabled
 * - room is active and has a public price
 * - stay starts today or later, 1..MAX_PUBLIC_NIGHTS nights
 * - the whole stay fits inside the location's release window (releaseWindowDays,
 *   0 = always open) so Flyspot clients keep priority further out
 * - no overlapping CONFIRMED reservation
 */
export function stayWithinWindow(checkIn: string, checkOut: string, releaseWindowDays: number): boolean {
  if (releaseWindowDays <= 0) return true;
  const today = todayYmd();
  return checkOut <= addDays(today, releaseWindowDays + 1);
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
        },
      },
    },
  });
  if (!location || !location.active || !location.publicBookingEnabled) return null;
  const windowOk = stayWithinWindow(checkIn, checkOut, location.releaseWindowDays);
  return {
    location,
    windowOk,
    rooms: windowOk ? location.rooms.filter((r) => r.reservations.length === 0) : [],
  };
}

/** Unguessable confirmation token so booking pages can't be enumerated. */
export function bookingSig(reservationId: number): string {
  const secret = process.env.AUTH_SECRET ?? "";
  return createHmac("sha256", secret).update(`public-booking.${reservationId}`).digest("hex").slice(0, 24);
}
