import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { getEurRate } from "@/lib/currency";
import PaymentsClient from "./PaymentsClient";

export const dynamic = "force-dynamic";

export default async function PaymentsPage() {
  const jar = await cookies();
  const showEur = jar.get("wr_eur")?.value === "1";
  const [payments, clients, eurRate] = await Promise.all([
    prisma.payment.findMany({
      include: { client: { select: { name: true } }, recordedBy: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.client.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    getEurRate(),
  ]);

  return (
    <PaymentsClient
      clients={clients}
      eurRate={eurRate}
      showEur={showEur}
      payments={payments.map((p) => ({
        id: p.id,
        clientName: p.client?.name ?? null,
        reservationId: p.reservationId,
        amountPln: Number(p.amountPln),
        method: p.method,
        status: p.status,
        note: p.note,
        recordedBy: p.recordedBy?.name ?? null,
        createdAt: p.createdAt.toISOString().slice(0, 16).replace("T", " "),
      }))}
    />
  );
}
