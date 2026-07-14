"use server";

import { prisma } from "@/lib/db";
import { nightsBetween, parseYmd } from "@/lib/dates";
import { bookingSig, stayWithinWindow, validStayDates } from "@/lib/booking";

export type PublicBookingResult =
  | { ok: true; id: number; sig: string }
  | { ok: false; error: string };

/**
 * Public (unauthenticated) booking. PAYMENTS_MODE governs the payment step:
 * demo (default) — the checkout is simulated and the booking is confirmed instantly.
 * test/live (later) — will create a Stripe checkout session instead.
 */
export async function createPublicBooking(input: {
  roomId: number;
  checkIn: string;
  checkOut: string;
  guestName: string;
  guestEmail: string;
  guestPhone?: string;
  notes?: string;
}): Promise<PublicBookingResult> {
  try {
    const dateError = validStayDates(input.checkIn, input.checkOut);
    if (dateError) return { ok: false, error: dateError };
    const guestName = input.guestName.trim();
    const guestEmail = input.guestEmail.trim().toLowerCase();
    if (guestName.length < 2) return { ok: false, error: "Please enter your name" };
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(guestEmail)) return { ok: false, error: "Please enter a valid email" };

    const room = await prisma.room.findUnique({ where: { id: input.roomId }, include: { location: true } });
    if (!room || !room.active || room.pricePln === null || !room.location.publicBookingEnabled || !room.location.active) {
      return { ok: false, error: "This room is not available for online booking" };
    }
    if (!stayWithinWindow(input.checkIn, input.checkOut, room.location.releaseWindowDays)) {
      return {
        ok: false,
        error: `Online bookings open ${room.location.releaseWindowDays} days before arrival — please pick closer dates`,
      };
    }

    const nights = nightsBetween(input.checkIn, input.checkOut);
    const total = nights * Number(room.pricePln);

    const id = await prisma.$transaction(async (tx) => {
      const conflict = await tx.reservation.findFirst({
        where: {
          roomId: room.id,
          status: "CONFIRMED",
          checkIn: { lt: parseYmd(input.checkOut) },
          checkOut: { gt: parseYmd(input.checkIn) },
        },
      });
      if (conflict) throw new Error("Sorry, this room was just booked for those dates");

      const reservation = await tx.reservation.create({
        data: {
          roomId: room.id,
          guestName,
          guestEmail,
          guestPhone: input.guestPhone?.trim() || null,
          checkIn: parseYmd(input.checkIn),
          checkOut: parseYmd(input.checkOut),
          status: "CONFIRMED",
          source: "PUBLIC",
          usesCredits: false,
          notes: input.notes?.trim() || null,
        },
      });
      await tx.payment.create({
        data: {
          reservationId: reservation.id,
          amountPln: total,
          method: "ONLINE",
          status: "PAID",
          paidAt: new Date(),
          note: `Public booking · ${nights} night(s) · ${guestEmail} · DEMO payment`,
        },
      });
      return reservation.id;
    });

    return { ok: true, id, sig: bookingSig(id) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unexpected error" };
  }
}
