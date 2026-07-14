import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getEurRate, fmtPln } from "@/lib/currency";
import { nightsBetween, parseYmd } from "@/lib/dates";
import { stayWithinWindow, validStayDates } from "@/lib/booking";
import CheckoutForm from "./CheckoutForm";

export const dynamic = "force-dynamic";

export default async function BookRoomPage({
  params,
  searchParams,
}: {
  params: Promise<{ roomId: string }>;
  searchParams: Promise<{ in?: string; out?: string }>;
}) {
  const { roomId: roomIdStr } = await params;
  const { in: checkIn, out: checkOut } = await searchParams;
  const roomId = Number(roomIdStr);
  if (!Number.isInteger(roomId) || !checkIn || !checkOut) redirect("/book");
  if (validStayDates(checkIn, checkOut)) redirect("/book");

  const room = await prisma.room.findUnique({ where: { id: roomId }, include: { location: true } });
  if (!room || !room.active || room.pricePln === null || !room.location.publicBookingEnabled) notFound();
  if (!stayWithinWindow(checkIn, checkOut, room.location.releaseWindowDays)) redirect("/book");

  const conflict = await prisma.reservation.findFirst({
    where: {
      roomId,
      status: "CONFIRMED",
      checkIn: { lt: parseYmd(checkOut) },
      checkOut: { gt: parseYmd(checkIn) },
    },
    select: { id: true },
  });

  const nights = nightsBetween(checkIn, checkOut);
  const nightly = Number(room.pricePln);
  const total = nights * nightly;
  const eurRate = await getEurRate();

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <Link href={`/book?in=${checkIn}&out=${checkOut}`} className="text-sm text-mut hover:text-ink">
        ← Back to rooms
      </Link>

      <div className="rounded-2xl border border-line bg-card p-5">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-lg font-semibold">Room {room.name}</h1>
            <p className="text-sm text-mut">{room.type === "DOUBLE" ? "Double — two single beds" : "Single room"} · Flyspot Gdańsk</p>
          </div>
          <span className="label-mono rounded-full border border-line px-2.5 py-1">{nights} night{nights === 1 ? "" : "s"}</span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg bg-hovr px-3 py-2">
            <div className="label-mono">Check-in</div>
            <div className="font-mono">{checkIn} · from 15:00</div>
          </div>
          <div className="rounded-lg bg-hovr px-3 py-2">
            <div className="label-mono">Check-out</div>
            <div className="font-mono">{checkOut} · by 11:00</div>
          </div>
        </div>
        <div className="mt-3 flex items-baseline justify-between border-t border-line pt-3">
          <span className="text-sm text-mut">{fmtPln(nightly, eurRate, true)} × {nights}</span>
          <span className="font-mono text-lg font-semibold">{fmtPln(total, eurRate, true)}</span>
        </div>
      </div>

      {conflict ? (
        <p className="text-center text-bad text-sm">
          Sorry — this room was just booked for those dates.{" "}
          <Link href="/book" className="underline">Pick other dates</Link>
        </p>
      ) : (
        <CheckoutForm roomId={roomId} checkIn={checkIn} checkOut={checkOut} totalLabel={fmtPln(total, eurRate, true)} />
      )}
    </div>
  );
}
