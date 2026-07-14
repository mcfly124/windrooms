"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { audit } from "@/lib/audit";
import type { PaymentMethod } from "@prisma/client";
import type { ActionResult } from "./reservations";
import { payLinkPath } from "@/lib/booking";
import { baseUrl, paymentLinkEmail, sendEmail } from "@/lib/email";

/** Operators record on-the-spot payments; admins can also create pending ones (e.g. payment links). */
export async function recordPayment(input: {
  reservationId?: number | null;
  clientId?: number | null;
  amountPln: number;
  method: PaymentMethod;
  paid: boolean;
  note?: string;
}): Promise<ActionResult> {
  try {
    const session = await requireRole("OPERATOR", "ADMIN", "SUPERADMIN");
    if (!(input.amountPln > 0)) return { ok: false, error: "Amount must be positive" };
    const payment = await prisma.payment.create({
      data: {
        reservationId: input.reservationId ?? null,
        clientId: input.clientId ?? null,
        amountPln: input.amountPln,
        method: input.method,
        status: input.paid ? "PAID" : "PENDING",
        paidAt: input.paid ? new Date() : null,
        note: input.note?.trim() || null,
        recordedById: session.user.id,
      },
    });
    await audit(session, "payment.record", "Payment", payment.id, `${input.amountPln} PLN, ${input.method}`);
    revalidatePath("/payments");
    return { ok: true, id: payment.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unexpected error" };
  }
}

export async function setPaymentStatus(id: number, status: "PAID" | "CANCELLED" | "REFUNDED"): Promise<ActionResult> {
  try {
    const session = await requireRole("OPERATOR", "ADMIN", "SUPERADMIN");
    await prisma.payment.update({
      where: { id },
      data: { status, paidAt: status === "PAID" ? new Date() : undefined },
    });
    await audit(session, "payment.status", "Payment", id, status);
    revalidatePath("/payments");
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unexpected error" };
  }
}

/** Emails the signed pay URL to the customer and stamps linkSentAt. */
export async function sendPaymentLink(paymentId: number): Promise<ActionResult> {
  try {
    const session = await requireRole("OPERATOR", "ADMIN", "SUPERADMIN");
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: { client: true, reservation: true },
    });
    if (!payment || payment.method !== "PAYMENT_LINK") return { ok: false, error: "Payment not found" };
    if (payment.status !== "PENDING") return { ok: false, error: "This payment is not pending" };
    const to = payment.client?.email ?? payment.reservation?.guestEmail;
    const name = payment.client?.name ?? payment.reservation?.guestName ?? "there";
    if (!to) return { ok: false, error: "No email on file for this payment — use copy link instead" };

    const mail = paymentLinkEmail({
      name,
      amountLabel: `${Number(payment.amountPln).toLocaleString("pl-PL")} zł`,
      payUrl: `${baseUrl()}${payLinkPath(payment.id)}`,
      note: payment.note,
    });
    const sent = await sendEmail({ to, ...mail });
    if (!sent.sent) return { ok: false, error: `Email to ${to} failed (${sent.error}) — use copy link instead` };
    await prisma.payment.update({ where: { id: paymentId }, data: { linkSentAt: new Date() } });
    await audit(session, "payment.link.send", "Payment", paymentId, `sent to ${to}`);
    revalidatePath("/payments");
    return { ok: true, id: paymentId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unexpected error" };
  }
}
