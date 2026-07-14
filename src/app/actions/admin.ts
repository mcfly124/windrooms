"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { hashPassword, requireRole } from "@/lib/auth";
import { audit } from "@/lib/audit";
import type { Role, RoomType } from "@prisma/client";
import type { ActionResult } from "./reservations";

// ---- locations & rooms (superadmin) ----

export async function saveLocation(input: {
  id?: number;
  name: string;
  slug: string;
  active: boolean;
  publicBookingEnabled: boolean;
  releaseWindowDays: number;
  hotelPartnerInfo?: string;
  publicDescription?: string;
  notes?: string;
}): Promise<ActionResult> {
  try {
    const session = await requireRole("SUPERADMIN");
    const data = {
      name: input.name.trim(),
      slug: input.slug.trim().toLowerCase(),
      active: input.active,
      publicBookingEnabled: input.publicBookingEnabled,
      releaseWindowDays: Math.max(0, Math.floor(input.releaseWindowDays)),
      hotelPartnerInfo: input.hotelPartnerInfo?.trim() || null,
      publicDescription: input.publicDescription?.trim() || null,
      notes: input.notes?.trim() || null,
    };
    if (!data.name || !data.slug) return { ok: false, error: "Name and slug are required" };
    const loc = input.id
      ? await prisma.location.update({ where: { id: input.id }, data })
      : await prisma.location.create({ data });
    await audit(session, input.id ? "location.update" : "location.create", "Location", loc.id, data.name);
    revalidatePath("/locations");
    return { ok: true, id: loc.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unexpected error" };
  }
}

export async function saveRoom(input: {
  id?: number;
  locationId: number;
  name: string;
  type: RoomType;
  active: boolean;
  pricePln?: number | null;
  notes?: string;
}): Promise<ActionResult> {
  try {
    const session = await requireRole("SUPERADMIN");
    if (!input.name.trim()) return { ok: false, error: "Room name is required" };
    const data = {
      locationId: input.locationId,
      name: input.name.trim(),
      type: input.type,
      active: input.active,
      pricePln: input.pricePln ?? null,
      notes: input.notes?.trim() || null,
    };
    const room = input.id
      ? await prisma.room.update({ where: { id: input.id }, data })
      : await prisma.room.create({ data });
    await audit(session, input.id ? "room.update" : "room.create", "Room", room.id, data.name);
    revalidatePath("/locations");
    revalidatePath("/calendar");
    return { ok: true, id: room.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unexpected error" };
  }
}

// ---- users (superadmin) ----

export async function saveUser(input: {
  id?: number;
  email: string;
  name: string;
  role: Role;
  locationId: number | null;
  active: boolean;
  password?: string; // required on create, optional (reset) on edit
}): Promise<ActionResult> {
  try {
    const session = await requireRole("SUPERADMIN");
    const email = input.email.trim().toLowerCase();
    if (!email || !input.name.trim()) return { ok: false, error: "Name and email are required" };
    if (!input.id && !input.password) return { ok: false, error: "Password is required for a new user" };
    if (input.password && input.password.length < 8) {
      return { ok: false, error: "Password must be at least 8 characters" };
    }
    const data = {
      email,
      name: input.name.trim(),
      role: input.role,
      locationId: input.role === "OPERATOR" ? input.locationId : null,
      active: input.active,
      ...(input.password ? { passwordHash: hashPassword(input.password) } : {}),
    };
    const user = input.id
      ? await prisma.user.update({ where: { id: input.id }, data })
      : await prisma.user.create({ data: data as typeof data & { passwordHash: string } });
    await audit(session, input.id ? "user.update" : "user.create", "User", user.id, `${email} (${input.role})`);
    revalidatePath("/users");
    return { ok: true, id: user.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unexpected error" };
  }
}

// ---- cleaning (admins) ----

export async function saveCleaningStaff(input: {
  id?: number;
  locationId: number;
  name: string;
  phone?: string;
  active: boolean;
}): Promise<ActionResult> {
  try {
    const session = await requireRole("ADMIN", "SUPERADMIN");
    if (!input.name.trim()) return { ok: false, error: "Name is required" };
    const data = {
      locationId: input.locationId,
      name: input.name.trim(),
      phone: input.phone?.trim() || null,
      active: input.active,
    };
    const staff = input.id
      ? await prisma.cleaningStaff.update({ where: { id: input.id }, data })
      : await prisma.cleaningStaff.create({ data });
    await audit(session, "cleaning.staff.save", "CleaningStaff", staff.id, data.name);
    revalidatePath("/cleaning");
    return { ok: true, id: staff.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unexpected error" };
  }
}

export async function saveCleaningShift(input: {
  id?: number;
  staffId: number;
  date: string; // YYYY-MM-DD
  startTime: string;
  endTime: string;
  note?: string;
}): Promise<ActionResult> {
  try {
    const session = await requireRole("ADMIN", "SUPERADMIN");
    const data = {
      staffId: input.staffId,
      date: new Date(`${input.date}T00:00:00.000Z`),
      startTime: input.startTime,
      endTime: input.endTime,
      note: input.note?.trim() || null,
    };
    const shift = input.id
      ? await prisma.cleaningShift.update({ where: { id: input.id }, data })
      : await prisma.cleaningShift.create({ data });
    await audit(session, "cleaning.shift.save", "CleaningShift", shift.id, `${input.date} ${input.startTime}-${input.endTime}`);
    revalidatePath("/cleaning");
    return { ok: true, id: shift.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unexpected error" };
  }
}

export async function deleteCleaningShift(id: number): Promise<ActionResult> {
  try {
    const session = await requireRole("ADMIN", "SUPERADMIN");
    await prisma.cleaningShift.delete({ where: { id } });
    await audit(session, "cleaning.shift.delete", "CleaningShift", id);
    revalidatePath("/cleaning");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unexpected error" };
  }
}
