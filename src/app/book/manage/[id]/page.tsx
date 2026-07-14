import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { bookingRef, bookingSig } from "@/lib/booking";
import { getEurRate, fmtPln } from "@/lib/currency";
import { todayYmd, ymd } from "@/lib/dates";
import ManageClient from "./ManageClient";

export const dynamic = "force-dynamic";

export default async function ManageBookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ sig?: string }>;
}) {
  const { id: idStr } = await params;
  const { sig } = await searchParams;
  const id = Number(idStr);
  if (!Number.isInteger(id) || !sig || bookingSig(id) !== sig) redirect("/book/manage");

  const reservation = await prisma.reservation.findUnique({
    where: { id },
    include: { room: { include: { location: true } }, payments: true },
  });
  if (!reservation || reservation.source !== "PUBLIC") redirect("/book/manage");

  const paid = reservation.payments
    .filter((p) => p.status === "PAID")
    .reduce((sum, p) => sum + Number(p.amountPln), 0);
  const eurRate = await getEurRate();
  const changeable = reservation.status === "CONFIRMED" && ymd(reservation.checkIn) > todayYmd();

  return (
    <ManageClient
      id={id}
      sig={sig}
      reference={bookingRef(id)}
      status={reservation.status}
      roomName={reservation.room.name}
      locationName={reservation.room.location.name}
      guestName={reservation.guestName ?? ""}
      checkIn={ymd(reservation.checkIn)}
      checkOut={ymd(reservation.checkOut)}
      checkInTime={reservation.checkInTime}
      checkOutTime={reservation.checkOutTime}
      nightlyLabel={reservation.room.pricePln ? fmtPln(Number(reservation.room.pricePln), eurRate, true) : null}
      nightlyPln={reservation.room.pricePln ? Number(reservation.room.pricePln) : null}
      paidLabel={fmtPln(paid, eurRate, true)}
      paidPln={paid}
      changeable={changeable}
    />
  );
}
