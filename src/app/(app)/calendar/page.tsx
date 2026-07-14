import { prisma } from "@/lib/db";
import { getSession, atLeast } from "@/lib/auth";
import { addDays, parseYmd, todayYmd, ymd } from "@/lib/dates";
import CalendarClient from "./CalendarClient";

export const dynamic = "force-dynamic";

function mondayOf(dateYmd: string): string {
  const d = parseYmd(dateYmd);
  const shift = (d.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  return addDays(dateYmd, -shift);
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ loc?: string; view?: string; anchor?: string }>;
}) {
  const params = await searchParams;
  const session = (await getSession())!;

  const locations = await prisma.location.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, slug: true },
  });
  const operatorLoc = locations.find((l) => l.id === session.user.locationId);
  const selected = locations.find((l) => l.slug === params.loc) ?? operatorLoc ?? locations[0];
  if (!selected) return <p className="text-mut">No locations configured yet.</p>;

  const view = params.view === "week" ? "week" : "month";
  const anchor = /^\d{4}-\d{2}-\d{2}$/.test(params.anchor ?? "") ? params.anchor! : todayYmd();

  // Visible range: month = Monday before the 1st → Sunday after month end; week = Mon–Sun
  let rangeStart: string;
  let rangeDays: number;
  if (view === "month") {
    const firstOfMonth = anchor.slice(0, 8) + "01";
    rangeStart = mondayOf(firstOfMonth);
    const d = parseYmd(firstOfMonth);
    d.setUTCMonth(d.getUTCMonth() + 1);
    const lastSunday = addDays(mondayOf(addDays(ymd(d), -1)), 6);
    rangeDays =
      Math.round((parseYmd(lastSunday).getTime() - parseYmd(rangeStart).getTime()) / 86400000) + 1;
  } else {
    rangeStart = mondayOf(anchor);
    rangeDays = 7;
  }

  const [rooms, reservations, clients] = await Promise.all([
    prisma.room.findMany({
      where: { locationId: selected.id, active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, type: true },
    }),
    prisma.reservation.findMany({
      where: {
        room: { locationId: selected.id },
        status: { not: "CANCELLED" },
        checkIn: { lt: parseYmd(addDays(rangeStart, rangeDays)) },
        checkOut: { gt: parseYmd(rangeStart) },
      },
      include: { client: { select: { id: true, name: true } }, room: { select: { name: true } } },
    }),
    prisma.client.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <CalendarClient
      locations={locations}
      selectedSlug={selected.slug}
      view={view}
      anchor={anchor}
      rangeStart={rangeStart}
      rangeDays={rangeDays}
      rooms={rooms}
      canEdit={atLeast(session.user.role, "ADMIN")}
      clients={clients}
      reservations={reservations.map((r) => ({
        id: r.id,
        roomId: r.roomId,
        roomName: r.room.name,
        clientId: r.clientId,
        clientName: r.client?.name ?? null,
        guestName: r.guestName,
        guestEmail: r.guestEmail,
        guestPhone: r.guestPhone,
        checkIn: ymd(r.checkIn),
        checkOut: ymd(r.checkOut),
        checkInTime: r.checkInTime,
        checkOutTime: r.checkOutTime,
        status: r.status,
        source: r.source,
        usesCredits: r.usesCredits,
        companionCount: r.companionCount,
        companionPayment: r.companionPayment,
        hotelOverflowCost: r.hotelOverflowCost ? Number(r.hotelOverflowCost) : null,
        notes: r.notes,
      }))}
    />
  );
}
