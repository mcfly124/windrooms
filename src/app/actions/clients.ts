"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { audit } from "@/lib/audit";
import type { ActionResult } from "./reservations";

export async function saveClient(input: {
  id?: number;
  name: string;
  email?: string;
  phone?: string;
  country?: string;
  notes?: string;
}): Promise<ActionResult> {
  try {
    const session = await requireRole("ADMIN", "SUPERADMIN");
    if (!input.name.trim()) return { ok: false, error: "Name is required" };
    const data = {
      name: input.name.trim(),
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
      country: input.country?.trim() || null,
      notes: input.notes?.trim() || null,
    };
    const client = input.id
      ? await prisma.client.update({ where: { id: input.id }, data })
      : await prisma.client.create({ data });
    await audit(session, input.id ? "client.update" : "client.create", "Client", client.id, data.name);
    revalidatePath("/clients");
    return { ok: true, id: client.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unexpected error" };
  }
}

export async function deleteClient(id: number): Promise<ActionResult> {
  try {
    const session = await requireRole("SUPERADMIN");
    const reservations = await prisma.reservation.count({ where: { clientId: id } });
    if (reservations > 0) {
      return { ok: false, error: "Client has reservations — cancel them first or keep the client" };
    }
    await prisma.client.delete({ where: { id } });
    await audit(session, "client.delete", "Client", id);
    revalidatePath("/clients");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unexpected error" };
  }
}

/** Manual package entry: grant (positive) or correction (can be negative). */
export async function addCreditGrant(input: {
  clientId: number;
  nights: number;
  scopeLocationId: number | null; // null = all locations
  note?: string;
}): Promise<ActionResult> {
  try {
    const session = await requireRole("ADMIN", "SUPERADMIN");
    if (!Number.isInteger(input.nights) || input.nights === 0) {
      return { ok: false, error: "Nights must be a non-zero whole number" };
    }
    const entry = await prisma.creditEntry.create({
      data: {
        clientId: input.clientId,
        nights: input.nights,
        scopeLocationId: input.scopeLocationId,
        note: input.note?.trim() || null,
        createdById: session.user.id,
      },
    });
    await audit(
      session,
      "credits.grant",
      "CreditEntry",
      entry.id,
      `${input.nights > 0 ? "+" : ""}${input.nights} nights for client #${input.clientId}`
    );
    revalidatePath("/clients");
    revalidatePath(`/clients/${input.clientId}`);
    return { ok: true, id: entry.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unexpected error" };
  }
}
