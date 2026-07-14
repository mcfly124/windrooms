"use server";

import { prisma } from "@/lib/db";
import { payLinkSig } from "@/lib/booking";
import type { ActionResult } from "./reservations";

/** Public (unauthenticated) — settles a payment-link payment in demo mode. */
export async function payDemoLink(paymentId: number, sig: string): Promise<ActionResult> {
  try {
    if (payLinkSig(paymentId) !== sig) return { ok: false, error: "Invalid payment link" };
    const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment || payment.method !== "PAYMENT_LINK") return { ok: false, error: "Payment not found" };
    if (payment.status === "PAID") return { ok: true, id: paymentId };
    if (payment.status !== "PENDING") return { ok: false, error: "This payment link is no longer active" };
    await prisma.payment.update({
      where: { id: paymentId },
      data: { status: "PAID", paidAt: new Date(), note: `${payment.note ?? ""} · paid via DEMO link`.trim() },
    });
    await prisma.inboxItem.create({
      data: {
        type: "payment.paid",
        title: `Payment link paid · ${Number(payment.amountPln).toLocaleString("pl-PL")} zł`,
        body: payment.note,
        reservationId: payment.reservationId,
      },
    });
    return { ok: true, id: paymentId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unexpected error" };
  }
}
