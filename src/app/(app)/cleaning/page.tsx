import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession, atLeast } from "@/lib/auth";
import { addDays, parseYmd, todayYmd, ymd } from "@/lib/dates";
import CleaningClient from "./CleaningClient";

export const dynamic = "force-dynamic";

export default async function CleaningPage() {
  const session = (await getSession())!;
  if (!atLeast(session.user.role, "ADMIN")) redirect("/dashboard");

  const today = todayYmd();
  const horizon = addDays(today, 14);

  const [locations, shifts, departures] = await Promise.all([
    prisma.location.findMany({
      where: { active: true },
      include: { cleaningStaff: { orderBy: { name: "asc" } } },
      orderBy: { name: "asc" },
    }),
    prisma.cleaningShift.findMany({
      where: { date: { gte: parseYmd(today), lte: parseYmd(horizon) } },
      include: { staff: { include: { location: true } } },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    }),
    // Upcoming checkouts = rooms that will need cleaning
    prisma.reservation.findMany({
      where: { status: "CONFIRMED", checkOut: { gte: parseYmd(today), lte: parseYmd(horizon) } },
      include: { room: { include: { location: true } } },
      orderBy: { checkOut: "asc" },
    }),
  ]);

  // Same-day turnover: another confirmed reservation starts the day this one ends
  const turnoverKeys = new Set(
    (
      await prisma.reservation.findMany({
        where: { status: "CONFIRMED", checkIn: { gte: parseYmd(today), lte: parseYmd(horizon) } },
        select: { roomId: true, checkIn: true },
      })
    ).map((r) => `${r.roomId}:${ymd(r.checkIn)}`)
  );

  return (
    <CleaningClient
      locations={locations.map((l) => ({
        id: l.id,
        name: l.name,
        staff: l.cleaningStaff.map((s) => ({ id: s.id, name: s.name, phone: s.phone, active: s.active })),
      }))}
      shifts={shifts.map((s) => ({
        id: s.id,
        date: ymd(s.date),
        startTime: s.startTime,
        endTime: s.endTime,
        note: s.note,
        staffName: s.staff.name,
        locationName: s.staff.location.name,
      }))}
      cleanings={departures.map((r) => ({
        id: r.id,
        date: ymd(r.checkOut),
        room: `${r.room.location.name} · ${r.room.name}`,
        turnover: turnoverKeys.has(`${r.roomId}:${ymd(r.checkOut)}`),
      }))}
    />
  );
}
