"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { chargeCredits, refundReservation } from "@/lib/credits";
import { nightsBetween, parseYmd } from "@/lib/dates";
import type { CompanionPayment, ReservationSource, ReservationStatus } from "@prisma/client";

export type ReservationInput = {
  id?: number;
  roomId: number;
  clientId?: number | null;
  guestName?: string;
  guestEmail?: string;
  guestPhone?: string;
  checkIn: string; // YYYY-MM-DD
  checkOut: string; // YYYY-MM-DD
  checkInTime?: string; // "HH:MM" 24h, default 15:00
  checkOutTime?: string; // "HH:MM" 24h, default 11:00
  status: ReservationStatus;
  source?: ReservationSource;
  usesCredits: boolean;
  companionCount: number;
  companionPayment?: CompanionPayment | null;
  hotelOverflowCost?: number | null;
  notes?: string;
};

export type ActionResult = { ok: true; id?: number } | { ok: false; error: string };

// Credits are consumed only for these statuses (standby holds nothing; overflow guests
// still burn their nights — the tunnel covers the partner hotel).
const CHARGING_STATUSES: ReservationStatus[] = ["CONFIRMED", "HOTEL_OVERFLOW"];

export async function saveReservation(input: ReservationInput): Promise<ActionResult> {
  try {
    const session = await requireRole("ADMIN", "SUPERADMIN");
    const nights = nightsBetween(input.checkIn, input.checkOut);
    if (nights <= 0) return { ok: false, error: "Check-out must be after check-in" };
    if (!input.clientId && !input.guestName?.trim()) {
      return { ok: false, error: "Pick a client or enter a guest name" };
    }
    if (input.usesCredits && !input.clientId) {
      return { ok: false, error: "Credits can only be used by a Flyspot client" };
    }

    const timeOk = (t: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
    const checkInTime = input.checkInTime ?? "15:00";
    const checkOutTime = input.checkOutTime ?? "11:00";
    if (!timeOk(checkInTime) || !timeOk(checkOutTime)) {
      return { ok: false, error: "Times must be HH:MM (24h)" };
    }

    const room = await prisma.room.findUnique({ where: { id: input.roomId } });
    if (!room || !room.active) return { ok: false, error: "Room not found" };

    const id = await prisma.$transaction(async (tx) => {
      // Overlap check: only CONFIRMED reservations physically occupy a room
      if (input.status === "CONFIRMED") {
        const conflict = await tx.reservation.findFirst({
          where: {
            roomId: input.roomId,
            status: "CONFIRMED",
            id: input.id ? { not: input.id } : undefined,
            checkIn: { lt: parseYmd(input.checkOut) },
            checkOut: { gt: parseYmd(input.checkIn) },
          },
          include: { client: true },
        });
        if (conflict) {
          const who = conflict.client?.name ?? conflict.guestName ?? "another guest";
          throw new Error(`Room ${room.name} is already confirmed for ${who} in that period`);
        }
      }

      const data = {
        roomId: input.roomId,
        clientId: input.clientId ?? null,
        guestName: input.guestName?.trim() || null,
        guestEmail: input.guestEmail?.trim() || null,
        guestPhone: input.guestPhone?.trim() || null,
        checkIn: parseYmd(input.checkIn),
        checkOut: parseYmd(input.checkOut),
        checkInTime,
        checkOutTime,
        status: input.status,
        source: input.source ?? "FLYSPOT",
        usesCredits: input.usesCredits,
        companionCount: input.companionCount,
        companionPayment: input.companionCount > 0 ? input.companionPayment ?? null : null,
        hotelOverflowCost: input.status === "HOTEL_OVERFLOW" ? input.hotelOverflowCost ?? null : null,
        notes: input.notes?.trim() || null,
      };

      let reservationId: number;
      let oldClientId: number | null = null;
      if (input.id) {
        const old = await tx.reservation.findUnique({ where: { id: input.id } });
        if (!old) throw new Error("Reservation not found");
        oldClientId = old.clientId;
        await tx.reservation.update({ where: { id: input.id }, data });
        reservationId = input.id;
      } else {
        const created = await tx.reservation.create({ data: { ...data, createdById: session.user.id } });
        reservationId = created.id;
      }

      // Reconcile credits: refund whatever was charged before, then charge fresh
      if (oldClientId) {
        await refundReservation(tx, reservationId, oldClientId, session.user.id, "Adjustment on edit");
      }
      const chargeableCompanions = input.companionPayment === "CREDITS" ? input.companionCount : 0;
      const creditNights = input.usesCredits ? nights * (1 + chargeableCompanions) : 0;
      if (creditNights > 0 && input.clientId && CHARGING_STATUSES.includes(input.status)) {
        await chargeCredits(
          tx,
          input.clientId,
          room.locationId,
          creditNights,
          reservationId,
          session.user.id,
          `${nights} night(s), room ${room.name}${chargeableCompanions ? `, +${chargeableCompanions} companion(s)` : ""}`
        );
      }
      return reservationId;
    });

    await audit(
      session,
      input.id ? "reservation.update" : "reservation.create",
      "Reservation",
      id,
      `Room ${room.name}, ${input.checkIn} → ${input.checkOut}, status ${input.status}`
    );
    revalidatePath("/calendar");
    revalidatePath("/dashboard");
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unexpected error" };
  }
}

export async function cancelReservation(id: number): Promise<ActionResult> {
  try {
    const session = await requireRole("ADMIN", "SUPERADMIN");
    await prisma.$transaction(async (tx) => {
      const res = await tx.reservation.findUnique({ where: { id } });
      if (!res) throw new Error("Reservation not found");
      await tx.reservation.update({ where: { id }, data: { status: "CANCELLED" } });
      if (res.clientId) {
        await refundReservation(tx, id, res.clientId, session.user.id, "Refund on cancellation");
      }
    });
    await audit(session, "reservation.cancel", "Reservation", id);
    revalidatePath("/calendar");
    revalidatePath("/dashboard");
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unexpected error" };
  }
}
