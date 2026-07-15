import { prisma } from "@/lib/db";
import { getEurRate } from "@/lib/currency";
import { todayYmd } from "@/lib/dates";
import Landing from "./Landing";

export const dynamic = "force-dynamic";

export default async function BookPage() {
  const location = await prisma.location.findUnique({
    where: { slug: "gdansk" },
    include: { rooms: { where: { active: true, pricePln: { not: null } } } },
  });
  const eurRate = (await getEurRate()) ?? 4.3;

  const types = (["SINGLE", "DOUBLE"] as const).map((type) => {
    const rooms = location?.rooms.filter((r) => r.type === type) ?? [];
    return {
      type,
      pricePln: rooms.length > 0 ? Number(rooms[0].pricePln) : 0,
      count: rooms.length,
    };
  });

  return (
    <Landing
      todayIso={todayYmd()}
      eurRate={eurRate}
      types={types}
      bookingEnabled={!!location?.active && !!location?.publicBookingEnabled}
    />
  );
}
