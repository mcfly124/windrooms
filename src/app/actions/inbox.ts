"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import type { ActionResult } from "./reservations";

export async function markInboxRead(id: number): Promise<ActionResult> {
  try {
    await requireRole("ADMIN", "SUPERADMIN");
    await prisma.inboxItem.update({ where: { id }, data: { readAt: new Date() } });
    revalidatePath("/inbox");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unexpected error" };
  }
}

export async function markAllInboxRead(): Promise<ActionResult> {
  try {
    await requireRole("ADMIN", "SUPERADMIN");
    await prisma.inboxItem.updateMany({ where: { readAt: null }, data: { readAt: new Date() } });
    revalidatePath("/inbox");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unexpected error" };
  }
}
