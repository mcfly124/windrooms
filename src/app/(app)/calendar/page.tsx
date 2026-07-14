import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { getSession, atLeast } from "@/lib/auth";
import { addDays, parseYmd, todayYmd, ymd } from "@/lib/dates";
import CalendarClient from "./CalendarClient";

export const dynamic = "force-dynamic";

const DAYS = 28;

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ loc?: string; start?: string }>;
}) {
  const params = await searchParams;
  const session = (await getSession())!;
  const jar = await cookies();
  void jar;

  const locations = await prisma.location.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, slug: true },
  });
  // Operators default to their own location
  const operatorLoc = locations.find((l) => l.id === session.user.locationId);
  const selected =
    locations.find((l) => l.slug === params.loc) ?? operatorLoc ?? locations[0];
  if (!selected) return <p className="text-zinc-400">No locations configured yet.</p>;

  const start = /^\d{4}-\d{2}-\d{2}$/.test(params.start ?? "") ? params.start! : addDays(todayYmd(), -1);

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
        checkIn: { lt: parseYmd(addDays(start, DAYS)) },
        checkOut: { gt: parseYmd(start) },
      },
      include: { client: { select: { id: true, name: true } } },
    }),
    prisma.client.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <CalendarClient
      locations={locations}
      selectedSlug={selected.slug}
      selectedLocationId={selected.id}
      start={start}
      days={DAYS}
      rooms={rooms}
      canEdit={atLeast(session.user.role, "ADMIN")}
      clients={clients}
      reservations={reservations.map((r) => ({
        id: r.id,
        roomId: r.roomId,
        clientId: r.clientId,
        clientName: r.client?.name ?? null,
        guestName: r.guestName,
        guestEmail: r.guestEmail,
        guestPhone: r.guestPhone,
        checkIn: ymd(r.checkIn),
        checkOut: ymd(r.checkOut),
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
