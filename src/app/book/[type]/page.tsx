import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getEurRate } from "@/lib/currency";
import { todayYmd } from "@/lib/dates";
import RoomDetail from "./RoomDetail";

export const dynamic = "force-dynamic";

export default async function RoomTypePage({ params }: { params: Promise<{ type: string }> }) {
  const { type: typeParam } = await params;
  const type = typeParam === "single" ? "SINGLE" : typeParam === "double" ? "DOUBLE" : null;
  if (!type) notFound();

  const location = await prisma.location.findUnique({
    where: { slug: "gdansk" },
    include: { rooms: { where: { active: true, type, pricePln: { not: null } } } },
  });
  const eurRate = (await getEurRate()) ?? 4.3;
  const rooms = location?.rooms ?? [];

  return (
    <RoomDetail
      type={type}
      todayIso={todayYmd()}
      eurRate={eurRate}
      pricePln={rooms.length > 0 ? Number(rooms[0].pricePln) : 0}
      count={rooms.length}
      bookingEnabled={!!location?.active && !!location?.publicBookingEnabled && rooms.length > 0}
    />
  );
}
