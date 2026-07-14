import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { getSession, atLeast } from "@/lib/auth";
import { getEurRate } from "@/lib/currency";
import { ymd } from "@/lib/dates";
import StatsClient from "./StatsClient";

export const dynamic = "force-dynamic";

const MONTHS_BACK = 6;

function monthKey(d: Date): string {
  return d.toISOString().slice(0, 7);
}

function daysInMonth(key: string): number {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export default async function StatsPage() {
  const session = (await getSession())!;
  if (!atLeast(session.user.role, "ADMIN")) redirect("/dashboard");
  const jar = await cookies();
  const showEur = jar.get("wr_eur")?.value === "1";

  // Months window: last MONTHS_BACK including current
  const now = new Date();
  const months: string[] = [];
  for (let i = MONTHS_BACK - 1; i >= 0; i--) {
    months.push(monthKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))));
  }
  const windowStart = new Date(`${months[0]}-01T00:00:00Z`);

  const [locations, reservations, payments, credits, eurRate] = await Promise.all([
    prisma.location.findMany({
      where: { active: true },
      include: { rooms: { where: { active: true }, select: { id: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.reservation.findMany({
      where: {
        status: { in: ["CONFIRMED", "HOTEL_OVERFLOW"] },
        checkIn: { lt: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)) },
        checkOut: { gt: windowStart },
      },
      select: {
        checkIn: true,
        checkOut: true,
        status: true,
        source: true,
        hotelOverflowCost: true,
        room: { select: { locationId: true } },
      },
    }),
    prisma.payment.findMany({
      where: { status: "PAID", createdAt: { gte: windowStart } },
      select: { amountPln: true, createdAt: true },
    }),
    prisma.creditEntry.findMany({
      where: { createdAt: { gte: windowStart } },
      select: { nights: true, createdAt: true },
    }),
    getEurRate(),
  ]);

  // Bucket occupied room-nights per month × location, and per month × source
  const occupancy: Record<string, Record<number, number>> = {};
  const bySource: Record<string, { flyspot: number; public: number }> = {};
  let overflowCost = 0;
  for (const m of months) {
    occupancy[m] = {};
    bySource[m] = { flyspot: 0, public: 0 };
  }
  for (const r of reservations) {
    if (r.status === "HOTEL_OVERFLOW" && r.hotelOverflowCost) overflowCost += Number(r.hotelOverflowCost);
    const start = new Date(Math.max(r.checkIn.getTime(), windowStart.getTime()));
    for (let d = new Date(start); d < r.checkOut; d.setUTCDate(d.getUTCDate() + 1)) {
      const m = monthKey(d);
      if (!occupancy[m]) continue;
      if (r.status === "CONFIRMED") {
        occupancy[m][r.room.locationId] = (occupancy[m][r.room.locationId] ?? 0) + 1;
        bySource[m][r.source === "PUBLIC" ? "public" : "flyspot"] += 1;
      }
    }
  }

  const revenueByMonth: Record<string, number> = Object.fromEntries(months.map((m) => [m, 0]));
  for (const p of payments) {
    const m = monthKey(p.createdAt);
    if (m in revenueByMonth) revenueByMonth[m] += Number(p.amountPln);
  }

  let granted = 0;
  let used = 0;
  for (const c of credits) {
    if (c.nights > 0) granted += c.nights;
    else used -= c.nights;
  }

  const currentMonth = months[months.length - 1];
  const todayStr = ymd(new Date());
  void todayStr;

  return (
    <StatsClient
      months={months}
      locations={locations.map((l) => ({ id: l.id, name: l.name, roomCount: l.rooms.length }))}
      occupancyPct={months.map((m) =>
        locations.map((l) => {
          const cap = l.rooms.length * daysInMonth(m);
          return cap > 0 ? Math.round(((occupancy[m][l.id] ?? 0) / cap) * 100) : 0;
        })
      )}
      bySource={months.map((m) => bySource[m])}
      revenue={months.map((m) => revenueByMonth[m])}
      tiles={{
        occupancyNow: (() => {
          const totalRooms = locations.reduce((s, l) => s + l.rooms.length, 0);
          const cap = totalRooms * daysInMonth(currentMonth);
          const occ = locations.reduce((s, l) => s + (occupancy[currentMonth][l.id] ?? 0), 0);
          return cap > 0 ? Math.round((occ / cap) * 100) : 0;
        })(),
        revenueThisMonth: revenueByMonth[currentMonth],
        creditsGranted: granted,
        creditsUsed: used,
        overflowCost,
      }}
      eurRate={eurRate}
      showEur={showEur}
    />
  );
}
