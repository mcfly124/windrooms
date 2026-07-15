"use server";

import { prisma } from "@/lib/db";
import { nightsBetween, parseYmd, todayYmd, ymd } from "@/lib/dates";
import { bookingRef, bookingSig, payLinkPath, publicAvailableRooms, stayOpenForRoom, validStayDates } from "@/lib/booking";
import {
  baseUrl,
  bookingCancelledEmail,
  bookingChangedEmail,
  bookingConfirmationEmail,
  sendEmail,
} from "@/lib/email";
import { getEurRate, fmtPln } from "@/lib/currency";
import { locationBalance } from "@/lib/credits";

export type PublicBookingResult =
  | { ok: true; id: number; sig: string }
  | { ok: false; error: string };

function manageUrl(id: number): string {
  return `${baseUrl()}/book/manage/${id}?sig=${bookingSig(id)}`;
}

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
    if (!(await stayOpenForRoom(prisma, room.id, input.checkIn, input.checkOut, room.location.releaseWindowDays))) {
      return { ok: false, error: "Those dates are not open for online booking — please pick closer dates" };
    }

    // Existing client with night credits usable here? Those bookings go through the team.
    const existingClient = await prisma.client.findFirst({
      where: { email: { equals: guestEmail, mode: "insensitive" } },
    });
    if (existingClient) {
      const { available } = await locationBalance(prisma, existingClient.id, room.locationId);
      if (available > 0) {
        const contact = process.env.PUBLIC_CONTACT_EMAIL ?? "pro@flyspot.com";
        return {
          ok: false,
          error: `This email has ${available} Flyspot night(s) available — stays using night credits are arranged by our team. Please write to ${contact} and we'll book your room.`,
        };
      }
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

      // Every public guest lives in the client DB, tagged EXTERNAL on first booking
      const client =
        existingClient ??
        (await tx.client.create({
          data: {
            name: guestName,
            email: guestEmail,
            phone: input.guestPhone?.trim() || null,
            category: "EXTERNAL",
            notes: "Auto-created from public booking",
          },
        }));

      const reservation = await tx.reservation.create({
        data: {
          roomId: room.id,
          clientId: client.id,
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
      await tx.inboxItem.create({
        data: {
          type: "booking.new",
          title: `New public booking ${bookingRef(reservation.id)} · ${guestName}`,
          body: `Room ${room.name}, ${input.checkIn} → ${input.checkOut}, ${total.toLocaleString("pl-PL")} zł${existingClient ? "" : " · new external client added"}`,
          reservationId: reservation.id,
        },
      });
      return reservation.id;
    });

    const eurRate = await getEurRate();
    const email = bookingConfirmationEmail({
      reference: bookingRef(id),
      guestName,
      roomName: room.name,
      locationName: room.location.name,
      checkIn: input.checkIn,
      checkOut: input.checkOut,
      checkInTime: "15:00",
      checkOutTime: "11:00",
      totalLabel: fmtPln(total, eurRate, true),
      manageUrl: manageUrl(id),
    });
    await sendEmail({ to: guestEmail, ...email });

    return { ok: true, id, sig: bookingSig(id) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unexpected error" };
  }
}

// ---- manage a booking with confirmation code + email ----

export async function findPublicBooking(
  reference: string,
  email: string
): Promise<{ ok: true; id: number; sig: string } | { ok: false; error: string }> {
  const match = reference.trim().toUpperCase().match(/^FR-?0*(\d+)$/);
  if (!match) return { ok: false, error: "That code doesn't look right — it's like FR-00012" };
  const id = Number(match[1]);
  const reservation = await prisma.reservation.findUnique({ where: { id } });
  if (
    !reservation ||
    reservation.source !== "PUBLIC" ||
    reservation.guestEmail?.toLowerCase() !== email.trim().toLowerCase()
  ) {
    return { ok: false, error: "No booking found for that code and email" };
  }
  return { ok: true, id, sig: bookingSig(id) };
}

export async function changePublicBookingDates(input: {
  id: number;
  sig: string;
  checkIn: string;
  checkOut: string;
}): Promise<{ ok: true; extraPayLink?: string; refundDue?: number } | { ok: false; error: string }> {
  try {
    if (bookingSig(input.id) !== input.sig) return { ok: false, error: "Invalid link" };
    const dateError = validStayDates(input.checkIn, input.checkOut);
    if (dateError) return { ok: false, error: dateError };

    const reservation = await prisma.reservation.findUnique({
      where: { id: input.id },
      include: { room: { include: { location: true } }, payments: true },
    });
    if (!reservation || reservation.source !== "PUBLIC" || reservation.status !== "CONFIRMED") {
      return { ok: false, error: "This booking can no longer be changed" };
    }
    if (ymd(reservation.checkIn) <= todayYmd()) {
      return { ok: false, error: "The stay has already started — contact us to change it" };
    }
    const room = reservation.room;
    if (!(await stayOpenForRoom(prisma, room.id, input.checkIn, input.checkOut, room.location.releaseWindowDays))) {
      return { ok: false, error: "Those dates are not open for online booking" };
    }

    const nights = nightsBetween(input.checkIn, input.checkOut);
    const newTotal = nights * Number(room.pricePln ?? 0);
    const paid = reservation.payments
      .filter((p) => p.status === "PAID")
      .reduce((sum, p) => sum + Number(p.amountPln), 0);
    const delta = newTotal - paid;

    let extraPayLink: string | undefined;
    await prisma.$transaction(async (tx) => {
      const conflict = await tx.reservation.findFirst({
        where: {
          roomId: room.id,
          status: "CONFIRMED",
          id: { not: reservation.id },
          checkIn: { lt: parseYmd(input.checkOut) },
          checkOut: { gt: parseYmd(input.checkIn) },
        },
      });
      if (conflict) throw new Error("The room is not free for those dates");

      await tx.reservation.update({
        where: { id: reservation.id },
        data: { checkIn: parseYmd(input.checkIn), checkOut: parseYmd(input.checkOut) },
      });
      if (delta > 0) {
        const payment = await tx.payment.create({
          data: {
            reservationId: reservation.id,
            amountPln: delta,
            method: "PAYMENT_LINK",
            status: "PENDING",
            note: `Date change ${bookingRef(reservation.id)} · difference for ${nights} night(s)`,
          },
        });
        extraPayLink = `${baseUrl()}${payLinkPath(payment.id)}`;
      }
      await tx.inboxItem.create({
        data: {
          type: "booking.changed",
          title: `Booking ${bookingRef(reservation.id)} changed · ${reservation.guestName ?? ""}`,
          body: `New dates ${input.checkIn} → ${input.checkOut}${
            delta > 0
              ? ` · ${delta.toLocaleString("pl-PL")} zł extra (link sent)`
              : delta < 0
                ? ` · refund due ${(-delta).toLocaleString("pl-PL")} zł`
                : ""
          }`,
          reservationId: reservation.id,
        },
      });
    });

    if (reservation.guestEmail) {
      const email = bookingChangedEmail({
        reference: bookingRef(reservation.id),
        guestName: reservation.guestName ?? "",
        checkIn: input.checkIn,
        checkOut: input.checkOut,
        manageUrl: manageUrl(reservation.id),
        extraPaymentUrl: extraPayLink ?? null,
      });
      await sendEmail({ to: reservation.guestEmail, ...email });
    }
    return { ok: true, extraPayLink, refundDue: delta < 0 ? -delta : undefined };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unexpected error" };
  }
}

export async function cancelPublicBooking(
  id: number,
  sig: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    if (bookingSig(id) !== sig) return { ok: false, error: "Invalid link" };
    const reservation = await prisma.reservation.findUnique({ where: { id } });
    if (!reservation || reservation.source !== "PUBLIC" || reservation.status !== "CONFIRMED") {
      return { ok: false, error: "This booking can no longer be cancelled online" };
    }
    if (ymd(reservation.checkIn) <= todayYmd()) {
      return { ok: false, error: "The stay has already started — contact us instead" };
    }
    await prisma.$transaction(async (tx) => {
      await tx.reservation.update({ where: { id }, data: { status: "CANCELLED" } });
      await tx.inboxItem.create({
        data: {
          type: "booking.cancelled",
          title: `Booking ${bookingRef(id)} cancelled · ${reservation.guestName ?? ""}`,
          body: `Was ${ymd(reservation.checkIn)} → ${ymd(reservation.checkOut)} · check payments for refund`,
          reservationId: id,
        },
      });
    });
    if (reservation.guestEmail) {
      const email = bookingCancelledEmail({ reference: bookingRef(id), guestName: reservation.guestName ?? "" });
      await sendEmail({ to: reservation.guestEmail, ...email });
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unexpected error" };
  }
}

// ---- room-type flow for the /book landing (design: guests pick a type, we assign a room) ----

export type TypeAvailability = {
  ok: boolean;
  types: { type: "SINGLE" | "DOUBLE"; pricePln: number; free: number }[];
};

export async function gdanskTypeAvailability(checkIn: string, checkOut: string): Promise<TypeAvailability> {
  if (validStayDates(checkIn, checkOut)) return { ok: false, types: [] };
  const result = await publicAvailableRooms("gdansk", checkIn, checkOut);
  if (!result) return { ok: false, types: [] };
  const types: TypeAvailability["types"] = [];
  for (const type of ["SINGLE", "DOUBLE"] as const) {
    const rooms = result.rooms.filter((r) => r.type === type);
    if (rooms.length > 0) {
      types.push({ type, pricePln: Number(rooms[0].pricePln), free: rooms.length });
    } else {
      types.push({ type, pricePln: 0, free: 0 });
    }
  }
  return { ok: true, types };
}

export type TypeBookingResult =
  | { ok: true; id: number; sig: string; reference: string; roomName: string }
  | { ok: false; error: string };

/** Books the first free room of the requested type at Gdańsk (all normal rules apply). */
export async function createPublicBookingByType(input: {
  type: "SINGLE" | "DOUBLE";
  checkIn: string;
  checkOut: string;
  guestName: string;
  guestEmail: string;
  guestPhone?: string;
}): Promise<TypeBookingResult> {
  const availability = await publicAvailableRooms("gdansk", input.checkIn, input.checkOut);
  const room = availability?.rooms.find((r) => r.type === input.type);
  if (!room) {
    return { ok: false, error: "No rooms of this type are free for those dates — please pick different dates" };
  }
  const result = await createPublicBooking({
    roomId: room.id,
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    guestName: input.guestName,
    guestEmail: input.guestEmail,
    guestPhone: input.guestPhone,
  });
  if (!result.ok) return result;
  return { ok: true, id: result.id, sig: result.sig, reference: bookingRef(result.id), roomName: room.name };
}
