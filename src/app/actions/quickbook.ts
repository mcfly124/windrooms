"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { chargeCredits, locationBalance } from "@/lib/credits";
import { nightsBetween, parseYmd } from "@/lib/dates";
import { payLinkPath } from "@/lib/booking";
import { flyspotBookingEmail, sendEmail } from "@/lib/email";

export async function clientBalanceAt(clientId: number, locationId: number): Promise<number> {
  await requireRole("ADMIN", "SUPERADMIN");
  const { available } = await locationBalance(prisma, clientId, locationId);
  return available;
}

export type QuickBookResult =
  | { ok: true; id: number; payLink?: string; paymentId?: number; emailNote: string }
  | { ok: false; error: string };

/**
 * Header "Quick booking": one shot for a Flyspot client, covering the nights with
 * any mix of the client's own credits, another client's credits (donor), and a
 * payment link (or pay-at-reception) for the rest.
 */
export async function quickBook(input: {
  clientId: number;
  roomId: number;
  checkIn: string;
  checkOut: string;
  checkInTime: string;
  checkOutTime: string;
  creditsFromClient: number;
  donorClientId?: number | null;
  donorNights: number;
  remainderVia: "LINK" | "RECEPTION" | "NONE";
  remainderAmountPln?: number | null;
  notes?: string;
}): Promise<QuickBookResult> {
  try {
    const session = await requireRole("ADMIN", "SUPERADMIN");
    const nights = nightsBetween(input.checkIn, input.checkOut);
    if (nights <= 0) return { ok: false, error: "Check-out must be after check-in" };
    const timeOk = (t: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
    if (!timeOk(input.checkInTime) || !timeOk(input.checkOutTime)) {
      return { ok: false, error: "Times must be HH:MM (24h)" };
    }

    const own = Math.max(0, Math.floor(input.creditsFromClient));
    const donor = Math.max(0, Math.floor(input.donorNights));
    if (donor > 0 && !input.donorClientId) return { ok: false, error: "Pick the client covering the extra nights" };
    if (own + donor > nights) return { ok: false, error: "Credits exceed the number of nights" };
    const remaining = nights - own - donor;
    if (remaining > 0 && input.remainderVia === "NONE") {
      return { ok: false, error: `${remaining} night(s) uncovered — choose payment link or reception` };
    }
    if (remaining > 0 && input.remainderVia === "LINK" && !(input.remainderAmountPln && input.remainderAmountPln > 0)) {
      return { ok: false, error: "Enter the payment link amount" };
    }

    const room = await prisma.room.findUnique({ where: { id: input.roomId }, include: { location: true } });
    if (!room || !room.active) return { ok: false, error: "Room not found" };
    const client = await prisma.client.findUnique({ where: { id: input.clientId } });
    if (!client) return { ok: false, error: "Client not found" };

    let paymentId: number | null = null;
    const id = await prisma.$transaction(async (tx) => {
      const conflict = await tx.reservation.findFirst({
        where: {
          roomId: room.id,
          status: "CONFIRMED",
          checkIn: { lt: parseYmd(input.checkOut) },
          checkOut: { gt: parseYmd(input.checkIn) },
        },
        include: { client: true },
      });
      if (conflict) {
        const who = conflict.client?.name ?? conflict.guestName ?? "another guest";
        throw new Error(`Room ${room.name} is already confirmed for ${who} in that period`);
      }

      const reservation = await tx.reservation.create({
        data: {
          roomId: room.id,
          clientId: client.id,
          checkIn: parseYmd(input.checkIn),
          checkOut: parseYmd(input.checkOut),
          checkInTime: input.checkInTime,
          checkOutTime: input.checkOutTime,
          status: "CONFIRMED",
          source: "FLYSPOT",
          usesCredits: own > 0,
          notes: input.notes?.trim() || null,
          createdById: session.user.id,
        },
      });

      if (own > 0) {
        await chargeCredits(tx, client.id, room.locationId, own, reservation.id, session.user.id,
          `${own} of ${nights} night(s), room ${room.name}`);
      }
      if (donor > 0 && input.donorClientId) {
        await chargeCredits(tx, input.donorClientId, room.locationId, donor, reservation.id, session.user.id,
          `${donor} night(s) covering ${client.name}, room ${room.name}`);
      }
      if (remaining > 0 && input.remainderVia === "LINK") {
        const payment = await tx.payment.create({
          data: {
            reservationId: reservation.id,
            clientId: client.id,
            amountPln: input.remainderAmountPln!,
            method: "PAYMENT_LINK",
            status: "PENDING",
            note: `Quick booking · ${remaining} night(s), room ${room.name}`,
            recordedById: session.user.id,
          },
        });
        paymentId = payment.id;
      }
      if (remaining > 0 && input.remainderVia === "RECEPTION") {
        await tx.payment.create({
          data: {
            reservationId: reservation.id,
            clientId: client.id,
            amountPln: input.remainderAmountPln ?? 0,
            method: "CASH",
            status: "PENDING",
            note: `Quick booking · ${remaining} night(s) to settle at reception, room ${room.name}`,
            recordedById: session.user.id,
          },
        });
      }
      return reservation.id;
    });

    await audit(session, "reservation.quickbook", "Reservation", id,
      `${client.name}, room ${room.name}, ${input.checkIn} → ${input.checkOut}, credits ${own}+${donor} donor, remainder ${input.remainderVia}`);
    revalidatePath("/calendar");
    revalidatePath("/dashboard");
    revalidatePath("/payments");

    // Confirmation email straight to the client (booking + access instructions)
    let emailNote: string;
    if (client.email) {
      const mail = flyspotBookingEmail({
        guestName: client.name,
        roomName: room.name,
        locationName: room.location.name,
        checkIn: input.checkIn,
        checkOut: input.checkOut,
        checkInTime: input.checkInTime,
        checkOutTime: input.checkOutTime,
        buildingInfo: room.location.buildingDoorInfo,
      });
      const sent = await sendEmail({ to: client.email, ...mail });
      emailNote = sent.sent
        ? `Confirmation emailed to ${client.email}`
        : `Confirmation email to ${client.email} failed (${sent.error})`;
    } else {
      emailNote = "Client has no email on file — no confirmation sent";
    }
    return {
      ok: true,
      id,
      payLink: paymentId ? payLinkPath(paymentId) : undefined,
      paymentId: paymentId ?? undefined,
      emailNote,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unexpected error" };
  }
}
