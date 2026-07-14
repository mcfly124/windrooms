"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { dayOpenToPublic } from "@/lib/booking";
import { parseYmd } from "@/lib/dates";
import type { ActionResult } from "./reservations";

/**
 * Cycle a room-day's public availability. With no override the day follows the
 * release-window default; toggling creates an override flipping it, toggling
 * again removes the override (back to default).
 */
export async function togglePublicDay(roomId: number, day: string): Promise<ActionResult> {
  try {
    const session = await requireRole("ADMIN", "SUPERADMIN");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return { ok: false, error: "Invalid date" };
    const room = await prisma.room.findUnique({ where: { id: roomId }, include: { location: true } });
    if (!room) return { ok: false, error: "Room not found" };

    const existing = await prisma.publicOverride.findUnique({
      where: { roomId_date: { roomId, date: parseYmd(day) } },
    });
    let result: string;
    if (existing) {
      await prisma.publicOverride.delete({ where: { id: existing.id } });
      result = "default";
    } else {
      const defaultOpen = dayOpenToPublic(day, room.location.releaseWindowDays, undefined);
      const state = defaultOpen ? "CLOSED" : "OPEN";
      await prisma.publicOverride.create({ data: { roomId, date: parseYmd(day), state } });
      result = state.toLowerCase();
    }
    await audit(session, "planner.toggle", "Room", roomId, `${room.name} ${day} → ${result}`);
    revalidatePath("/planner");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unexpected error" };
  }
}
