import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { payLinkSig } from "@/lib/booking";
import { getEurRate, fmtPln } from "@/lib/currency";
import { ymd } from "@/lib/dates";
import PayClient from "./PayClient";

export const dynamic = "force-dynamic";

export default async function PayLinkPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ sig?: string }>;
}) {
  const { id: idStr } = await params;
  const { sig } = await searchParams;
  const id = Number(idStr);
  if (!Number.isInteger(id) || !sig || payLinkSig(id) !== sig) redirect("/book");

  const payment = await prisma.payment.findUnique({
    where: { id },
    include: {
      client: { select: { name: true } },
      reservation: { include: { room: { include: { location: true } } } },
    },
  });
  if (!payment || payment.method !== "PAYMENT_LINK") redirect("/book");
  const eurRate = await getEurRate();

  return (
    <div className="min-h-screen bg-bg text-ink flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-4">
        <div className="flex items-center gap-3 justify-center">
          <div className="w-9 h-9 rounded-xl bg-acc text-white flex items-center justify-center font-semibold text-sm">FR</div>
          <div className="text-sm font-semibold">Flyspot Rooms</div>
        </div>
        <PayClient
          paymentId={payment.id}
          sig={sig}
          alreadyPaid={payment.status === "PAID"}
          cancelled={payment.status === "CANCELLED" || payment.status === "REFUNDED"}
          amountLabel={fmtPln(Number(payment.amountPln), eurRate, true)}
          summary={[
            payment.client?.name ?? payment.reservation?.guestName ?? "",
            payment.reservation
              ? `Room ${payment.reservation.room.name} · Flyspot ${payment.reservation.room.location.name}`
              : "",
            payment.reservation
              ? `${ymd(payment.reservation.checkIn)} → ${ymd(payment.reservation.checkOut)}`
              : "",
            payment.note ?? "",
          ].filter(Boolean)}
        />
      </div>
    </div>
  );
}
