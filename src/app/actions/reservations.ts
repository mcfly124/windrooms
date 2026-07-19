"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { chargeCredits, refundReservation } from "@/lib/credits";
import { nightsBetween, parseYmd } from "@/lib/dates";
import { notifyStatusChange } from "@/lib/notify";
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
  overflowHotel?: string | null;
  notes?: string;
};

export type ActionResult = { ok: true; id?: number } | { ok: false; error: string; conflict?: boolean };

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
    // Guests always become clients: email is mandatory so they land in the client DB
    if (!input.clientId && input.guestName?.trim()) {
      const guestEmail = input.guestEmail?.trim().toLowerCase() ?? "";
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(guestEmail)) {
        return { ok: false, error: "Enter the guest's email — it's needed to add them to the client list" };
      }
      const existing = await prisma.client.findFirst({
        where: { email: { equals: guestEmail, mode: "insensitive" } },
      });
      const client =
        existing ??
        (await prisma.client.create({
          data: {
            name: input.guestName.trim(),
            email: guestEmail,
            phone: input.guestPhone?.trim() || null,
            category: "EXTERNAL",
            notes: "Auto-created from a manual booking",
          },
        }));
      input = { ...input, clientId: client.id };
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

    let previousStatus: ReservationStatus | null = null;
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
          throw new Error(`CONFLICT|Room ${room.name} is already confirmed for ${who} in that period`);
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
        overflowHotel: input.status === "HOTEL_OVERFLOW" ? input.overflowHotel?.trim() || null : null,
        notes: input.notes?.trim() || null,
      };

      let reservationId: number;
      let oldClientId: number | null = null;
      if (input.id) {
        const old = await tx.reservation.findUnique({ where: { id: input.id } });
        if (!old) throw new Error("Reservation not found");
        oldClientId = old.clientId;
        previousStatus = old.status;
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
    // Outside the transaction: the guest email and inbox row must never be able
    // to roll back a saved reservation.
    await notifyStatusChange(id, previousStatus, input.status);
    revalidatePath("/calendar");
    revalidatePath("/dashboard");
    revalidatePath("/inbox");
    return { ok: true, id };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    if (msg.startsWith("CONFLICT|")) return { ok: false, error: msg.slice(9), conflict: true };
    return { ok: false, error: msg };
  }
}

export async function cancelReservation(id: number): Promise<ActionResult> {
  try {
    const session = await requireRole("ADMIN", "SUPERADMIN");
    const previousStatus = await prisma.$transaction(async (tx) => {
      const res = await tx.reservation.findUnique({ where: { id } });
      if (!res) throw new Error("Reservation not found");
      await tx.reservation.update({ where: { id }, data: { status: "CANCELLED" } });
      if (res.clientId) {
        await refundReservation(tx, id, res.clientId, session.user.id, "Refund on cancellation");
      }
      return res.status;
    });
    await audit(session, "reservation.cancel", "Reservation", id);
    await notifyStatusChange(id, previousStatus, "CANCELLED");
    revalidatePath("/calendar");
    revalidatePath("/dashboard");
    revalidatePath("/inbox");
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unexpected error" };
  }
}

export type Alternatives = {
  freeRooms: { id: number; name: string; type: string }[];
  split: { date: string; roomId: number; roomName: string } | null;
};

/**
 * When the wanted room is taken: which rooms at the location are free for the
 * whole stay, and failing that, the earliest date from which some room is free
 * for the remainder (first nights → partner hotel, rest → tunnel room).
 */
export async function findAlternatives(
  locationId: number,
  checkIn: string,
  checkOut: string
): Promise<Alternatives> {
  await requireRole("ADMIN", "SUPERADMIN");
  const rooms = await prisma.room.findMany({
    where: { locationId, active: true },
    orderBy: { name: "asc" },
    include: {
      reservations: {
        where: {
          status: "CONFIRMED",
          checkIn: { lt: parseYmd(checkOut) },
          checkOut: { gt: parseYmd(checkIn) },
        },
        select: { checkIn: true, checkOut: true },
      },
    },
  });

  const freeRooms = rooms
    .filter((r) => r.reservations.length === 0)
    .map((r) => ({ id: r.id, name: r.name, type: r.type as string }));

  let split: Alternatives["split"] = null;
  if (freeRooms.length === 0) {
    const totalNights = nightsBetween(checkIn, checkOut);
    outer: for (let i = 1; i < totalNights; i++) {
      const day = new Date(parseYmd(checkIn));
      day.setUTCDate(day.getUTCDate() + i);
      const from = day.toISOString().slice(0, 10);
      for (const r of rooms) {
        const busy = r.reservations.some(
          (res) => res.checkIn < parseYmd(checkOut) && res.checkOut > parseYmd(from)
        );
        if (!busy) {
          split = { date: from, roomId: r.id, roomName: r.name };
          break outer;
        }
      }
    }
  }
  return { freeRooms, split };
}

/**
 * Fully-booked start: first nights at a partner hotel (HOTEL_OVERFLOW), the rest
 * as a normal confirmed stay in a room that frees up. One transaction, two
 * reservations; credits (if used) cover both segments per the overflow rule.
 */
export async function saveSplitStay(input: {
  clientId: number;
  roomId: number;
  splitDate: string;
  checkIn: string;
  checkOut: string;
  checkInTime?: string;
  checkOutTime?: string;
  usesCredits: boolean;
  overflowHotel: string;
  notes?: string;
}): Promise<ActionResult> {
  try {
    const session = await requireRole("ADMIN", "SUPERADMIN");
    if (!(input.checkIn < input.splitDate && input.splitDate < input.checkOut)) {
      return { ok: false, error: "Split date must fall inside the stay" };
    }
    const room = await prisma.room.findUnique({ where: { id: input.roomId } });
    if (!room || !room.active) return { ok: false, error: "Room not found" };
    const hotelNights = nightsBetween(input.checkIn, input.splitDate);
    const roomNights = nightsBetween(input.splitDate, input.checkOut);

    const ids = await prisma.$transaction(async (tx) => {
      const conflict = await tx.reservation.findFirst({
        where: {
          roomId: room.id,
          status: "CONFIRMED",
          checkIn: { lt: parseYmd(input.checkOut) },
          checkOut: { gt: parseYmd(input.splitDate) },
        },
      });
      if (conflict) throw new Error(`CONFLICT|Room ${room.name} is no longer free from ${input.splitDate}`);

      const overflow = await tx.reservation.create({
        data: {
          roomId: room.id,
          clientId: input.clientId,
          checkIn: parseYmd(input.checkIn),
          checkOut: parseYmd(input.splitDate),
          checkInTime: input.checkInTime ?? "15:00",
          checkOutTime: "11:00",
          status: "HOTEL_OVERFLOW",
          source: "FLYSPOT",
          usesCredits: input.usesCredits,
          overflowHotel: input.overflowHotel.trim() || null,
          notes: `${input.notes?.trim() ? input.notes.trim() + " · " : ""}Partner hotel until room frees up`,
          createdById: session.user.id,
        },
      });
      const stay = await tx.reservation.create({
        data: {
          roomId: room.id,
          clientId: input.clientId,
          checkIn: parseYmd(input.splitDate),
          checkOut: parseYmd(input.checkOut),
          checkInTime: "15:00",
          checkOutTime: input.checkOutTime ?? "11:00",
          status: "CONFIRMED",
          source: "FLYSPOT",
          usesCredits: input.usesCredits,
          notes: input.notes?.trim() || null,
          createdById: session.user.id,
        },
      });
      if (input.usesCredits) {
        await chargeCredits(tx, input.clientId, room.locationId, hotelNights, overflow.id, session.user.id,
          `${hotelNights} night(s) at partner hotel (${input.overflowHotel})`);
        await chargeCredits(tx, input.clientId, room.locationId, roomNights, stay.id, session.user.id,
          `${roomNights} night(s), room ${room.name}`);
      }
      return [overflow.id, stay.id];
    });

    await audit(session, "reservation.split", "Reservation", ids[1],
      `Split stay: hotel ${input.overflowHotel} ${input.checkIn} → ${input.splitDate}, room ${room.name} → ${input.checkOut}`);
    revalidatePath("/calendar");
    revalidatePath("/dashboard");
    return { ok: true, id: ids[1] };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    if (msg.startsWith("CONFLICT|")) return { ok: false, error: msg.slice(9), conflict: true };
    return { ok: false, error: msg };
  }
}
