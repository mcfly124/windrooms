import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { bookingSig } from "@/lib/booking";
import { ymd } from "@/lib/dates";

export const dynamic = "force-dynamic";

export default async function ConfirmedPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; sig?: string }>;
}) {
  const { id: idStr, sig } = await searchParams;
  const id = Number(idStr);
  if (!Number.isInteger(id) || !sig || bookingSig(id) !== sig) redirect("/book");

  const reservation = await prisma.reservation.findUnique({
    where: { id },
    include: { room: { include: { location: true } }, payments: true },
  });
  if (!reservation || reservation.source !== "PUBLIC") redirect("/book");

  const reference = `FR-${String(reservation.id).padStart(5, "0")}`;

  return (
    <div className="max-w-md mx-auto text-center space-y-6 py-8">
      <div className="mx-auto w-14 h-14 rounded-full bg-ok-soft text-ok flex items-center justify-center">
        <svg viewBox="0 0 24 24" className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </div>
      <div>
        <h1 className="text-2xl font-semibold">You&apos;re booked!</h1>
        <p className="text-mut mt-1">A confirmation was registered for {reservation.guestEmail}.</p>
      </div>

      <div className="rounded-2xl border border-line bg-card p-5 text-left space-y-3">
        <div className="flex justify-between">
          <span className="label-mono">Reference</span>
          <span className="font-mono font-semibold">{reference}</span>
        </div>
        <div className="flex justify-between">
          <span className="label-mono">Room</span>
          <span className="font-mono">{reservation.room.name} · Flyspot {reservation.room.location.name}</span>
        </div>
        <div className="flex justify-between">
          <span className="label-mono">Check-in</span>
          <span className="font-mono">{ymd(reservation.checkIn)} · from {reservation.checkInTime}</span>
        </div>
        <div className="flex justify-between">
          <span className="label-mono">Check-out</span>
          <span className="font-mono">{ymd(reservation.checkOut)} · by {reservation.checkOutTime}</span>
        </div>
        <div className="flex justify-between border-t border-line pt-3">
          <span className="label-mono">Paid</span>
          <span className="font-mono font-semibold">
            {Number(reservation.payments[0]?.amountPln ?? 0).toLocaleString("pl-PL")} zł
          </span>
        </div>
      </div>

      <p className="text-sm text-mut">
        Before your arrival you&apos;ll receive the building door code and your room code — check in any time after
        15:00, no reception needed.
      </p>

      <Link href="/book" className="btn-ghost inline-block">Back to Flyspot Rooms</Link>
    </div>
  );
}
