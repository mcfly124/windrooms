import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession, atLeast } from "@/lib/auth";
import { addDays, parseYmd, todayYmd, ymd } from "@/lib/dates";
import PlannerClient from "./PlannerClient";

export const dynamic = "force-dynamic";

const DAYS = 35;

export default async function PlannerPage({
  searchParams,
}: {
  searchParams: Promise<{ loc?: string; start?: string }>;
}) {
  const session = (await getSession())!;
  if (!atLeast(session.user.role, "ADMIN")) redirect("/dashboard");
  const params = await searchParams;

  const locations = await prisma.location.findMany({
    where: { active: true, publicBookingEnabled: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, slug: true, releaseWindowDays: true },
  });
  if (locations.length === 0) {
    return (
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">Planner</h1>
        <p className="text-mut text-sm">
          No location has public booking enabled — turn it on under Locations first.
        </p>
      </div>
    );
  }
  const selected = locations.find((l) => l.slug === params.loc) ?? locations[0];
  const start = /^\d{4}-\d{2}-\d{2}$/.test(params.start ?? "") ? params.start! : todayYmd();

  const [rooms, reservations, overrides] = await Promise.all([
    prisma.room.findMany({
      where: { locationId: selected.id, active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, type: true, pricePln: true },
    }),
    prisma.reservation.findMany({
      where: {
        room: { locationId: selected.id },
        status: "CONFIRMED",
        checkIn: { lt: parseYmd(addDays(start, DAYS)) },
        checkOut: { gt: parseYmd(start) },
      },
      include: { client: { select: { name: true } } },
    }),
    prisma.publicOverride.findMany({
      where: {
        room: { locationId: selected.id },
        date: { gte: parseYmd(start), lt: parseYmd(addDays(start, DAYS)) },
      },
    }),
  ]);

  return (
    <PlannerClient
      locations={locations.map((l) => ({ id: l.id, name: l.name, slug: l.slug }))}
      selectedSlug={selected.slug}
      releaseWindowDays={selected.releaseWindowDays}
      start={start}
      days={DAYS}
      rooms={rooms.map((r) => ({
        id: r.id,
        name: r.name,
        type: r.type,
        hasPrice: r.pricePln !== null,
      }))}
      reservations={reservations.map((r) => ({
        roomId: r.roomId,
        checkIn: ymd(r.checkIn),
        checkOut: ymd(r.checkOut),
        who: r.client?.name ?? r.guestName ?? "guest",
        source: r.source,
      }))}
      overrides={overrides.map((o) => ({ roomId: o.roomId, date: ymd(o.date), state: o.state }))}
    />
  );
}
