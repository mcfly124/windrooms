import { prisma } from "./db";
import { addDays, todayYmd, ymd } from "./dates";
import { bookingRef } from "./ref";
import { STANDBY_DECISION_DAYS, STANDBY_REMINDER_DAYS, standbyDecisionDate } from "./standby";
import {
  baseUrl,
  bookingCancelledEmail,
  reservationConfirmedEmail,
  reservationOverflowEmail,
  reservationStandbyEmail,
  sendEmail,
  standbyReminderEmail,
} from "./email";
import type { ReservationStatus } from "@prisma/client";

type ResWithRelations = {
  id: number;
  status: ReservationStatus;
  checkIn: Date;
  checkOut: Date;
  checkInTime: string;
  checkOutTime: string;
  guestName: string | null;
  guestEmail: string | null;
  overflowHotel: string | null;
  client: { name: string; email: string } | null;
  room: { name: string; location: { name: string } };
};

const INCLUDE = {
  client: { select: { name: true, email: true } },
  room: { select: { name: true, location: { select: { name: true } } } },
} as const;

/**
 * Tell the admins (inbox) and the guest (email) that a reservation changed
 * status. Best-effort on purpose: a reservation must never fail to save
 * because a notification could not go out.
 */
export async function notifyStatusChange(
  reservationId: number,
  from: ReservationStatus | null,
  to: ReservationStatus
): Promise<void> {
  if (from === to) return;
  // A brand-new confirmed booking is not a "status change" worth announcing —
  // the booking flows send their own confirmation.
  if (from === null && to === "CONFIRMED") return;

  try {
    const r = (await prisma.reservation.findUnique({
      where: { id: reservationId },
      include: INCLUDE,
    })) as ResWithRelations | null;
    if (!r) return;

    const ref = bookingRef(r.id);
    const guestName = r.client?.name ?? r.guestName ?? "Guest";
    const to_ = r.client?.email ?? r.guestEmail ?? null;
    const checkIn = ymd(r.checkIn);
    const checkOut = ymd(r.checkOut);
    const where = `${r.room.location.name} · ${r.room.name}`;

    // A standby created inside the 7-day window has a deadline in the past.
    // Staff should see that it is already overdue; the guest should never be
    // promised an answer by a date that has been and gone.
    const today = todayYmd();
    const deadline = standbyDecisionDate(checkIn);
    const overdue = deadline < today;
    const guestDeadline = overdue ? today : deadline;

    const inboxTitle: Record<string, string> = {
      STANDBY: `Standby ${ref} · ${guestName} — decide by ${deadline}${overdue ? " (overdue)" : ""}`,
      CONFIRMED: `Confirmed ${ref} · ${guestName}`,
      HOTEL_OVERFLOW: `Moved to a partner hotel ${ref} · ${guestName}`,
      CANCELLED: `Cancelled ${ref} · ${guestName}`,
    };

    await prisma.inboxItem.create({
      data: {
        type: `reservation.${to.toLowerCase()}`,
        title: inboxTitle[to] ?? `Reservation ${ref} · ${to.toLowerCase()}`,
        body: `${where} · ${checkIn} → ${checkOut}${from ? ` · was ${from.toLowerCase()}` : ""}`,
        reservationId: r.id,
      },
    });

    if (!to_) return;
    const email =
      to === "STANDBY"
        ? reservationStandbyEmail({
            guestName,
            reference: ref,
            roomName: r.room.name,
            locationName: r.room.location.name,
            checkIn,
            checkOut,
            decisionBy: guestDeadline,
          })
        : to === "CONFIRMED"
          ? reservationConfirmedEmail({
              guestName,
              reference: ref,
              roomName: r.room.name,
              locationName: r.room.location.name,
              checkIn,
              checkOut,
              checkInTime: r.checkInTime,
              checkOutTime: r.checkOutTime,
            })
          : to === "HOTEL_OVERFLOW"
            ? reservationOverflowEmail({
                guestName,
                reference: ref,
                locationName: r.room.location.name,
                checkIn,
                checkOut,
                hotel: r.overflowHotel,
              })
            : bookingCancelledEmail({ reference: ref, guestName });

    await sendEmail({ to: to_, subject: email.subject, html: email.html });
  } catch (e) {
    console.error("[notifyStatusChange failed]", e);
  }
}

/**
 * Standby reminders for a given day: one at 8 days out as a heads-up, one at
 * the 7-day deadline. Idempotent — an existing inbox row for the same
 * reservation and milestone means this day was already processed, so re-running
 * the cron (or running it twice) sends nothing extra.
 */
export async function sendStandbyReminders(today: string): Promise<{ sent: number; checked: number }> {
  let sent = 0;
  let checked = 0;

  for (const daysLeft of STANDBY_REMINDER_DAYS) {
    const target = addDays(today, daysLeft);
    const due = await prisma.reservation.findMany({
      where: { status: "STANDBY", checkIn: new Date(`${target}T00:00:00.000Z`) },
      include: INCLUDE,
    });
    checked += due.length;

    for (const r of due as unknown as ResWithRelations[]) {
      const type = `standby.reminder.${daysLeft}`;
      const already = await prisma.inboxItem.findFirst({ where: { type, reservationId: r.id } });
      if (already) continue;

      const ref = bookingRef(r.id);
      const guestName = r.client?.name ?? r.guestName ?? "Guest";
      const urgent = daysLeft <= STANDBY_DECISION_DAYS;

      await prisma.inboxItem.create({
        data: {
          type,
          title: `${urgent ? "Decision due today" : "Standby reminder"}: ${ref} · ${guestName} · ${daysLeft} days to check-in`,
          body: `${r.room.location.name} · ${r.room.name} · check-in ${ymd(r.checkIn)}. ${
            urgent
              ? "Confirm the room or move the guest to a partner hotel."
              : "Deadline to confirm or re-house is tomorrow."
          }`,
          reservationId: r.id,
        },
      });

      const admins = await prisma.user.findMany({
        where: { role: { in: ["ADMIN", "SUPERADMIN"] }, active: true },
        select: { email: true },
      });
      const mail = standbyReminderEmail({
        guestName,
        reference: ref,
        roomName: r.room.name,
        locationName: r.room.location.name,
        checkIn: ymd(r.checkIn),
        daysLeft,
        calendarUrl: `${baseUrl()}/calendar`,
      });
      for (const a of admins) {
        if (a.email) await sendEmail({ to: a.email, subject: mail.subject, html: mail.html });
      }
      sent += 1;
    }
  }

  return { sent, checked };
}
