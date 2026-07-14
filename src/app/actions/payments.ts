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
    if (input.method === "PAYMENT_LINK" && !input.paid && input.clientId) {
      const client = await prisma.client.findUnique({ where: { id: input.clientId } });
      if (client?.email) {
        const mail = paymentLinkEmail({
          name: client.name,
          amountLabel: `${input.amountPln.toLocaleString("pl-PL")} zł`,
          payUrl: `${baseUrl()}${payLinkPath(payment.id)}`,
          note: input.note,
        });
        const sent = await sendEmail({ to: client.email, ...mail });
        if (!sent.sent) {
          return { ok: false, error: `Payment saved, but the email to ${client.email} failed (${sent.error}) — use “copy link” in the table to send it manually` };
        }
      } else {
        return { ok: false, error: "Payment saved, but the client has no email — use “copy link” in the table to send it manually" };
      }
    }
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
