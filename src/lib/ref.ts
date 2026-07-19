/**
 * The guest-facing confirmation code, derived from the reservation id so it
 * never needs storing. Lives apart from booking.ts because that module pulls
 * in prisma and crypto — this one has to be importable from client components.
 */
export function bookingRef(reservationId: number): string {
  return `FR-${String(reservationId).padStart(5, "0")}`;
}
