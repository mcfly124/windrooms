"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { hashPassword, requireRole } from "@/lib/auth";
import { randomBytes } from "crypto";
import { baseUrl, sendEmail, userInviteEmail } from "@/lib/email";
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

export async function deleteRoom(id: number): Promise<ActionResult> {
  try {
    const session = await requireRole("SUPERADMIN");
    const room = await prisma.room.findUnique({ where: { id } });
    if (!room) return { ok: false, error: "Room not found" };
    const reservations = await prisma.reservation.count({ where: { roomId: id } });
    if (reservations > 0) {
      return {
        ok: false,
        error: `Room ${room.name} has ${reservations} reservation(s) — deactivate it instead so the history stays intact`,
      };
    }
    await prisma.room.delete({ where: { id } }); // planner overrides cascade
    await audit(session, "room.delete", "Room", id, room.name);
    revalidatePath("/locations");
    revalidatePath("/calendar");
    return { ok: true };
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
  locationIds: number[];
  active: boolean;
  password?: string; // optional reset on edit; new users get an invite email instead
}): Promise<ActionResult> {
  try {
    const session = await requireRole("SUPERADMIN");
    const email = input.email.trim().toLowerCase();
    if (!email || !input.name.trim()) return { ok: false, error: "Name and email are required" };
    if (input.password && input.password.length < 8) {
      return { ok: false, error: "Password must be at least 8 characters" };
    }
    if (input.role === "OPERATOR" && input.locationIds.length === 0) {
      return { ok: false, error: "Pick at least one location for the operator" };
    }
    const data = {
      email,
      name: input.name.trim(),
      role: input.role,
      active: input.active,
      // Operators get their locations; admins/superadmin are global
      locations: { set: input.role === "OPERATOR" ? input.locationIds.map((id) => ({ id })) : [] },
      ...(input.password ? { passwordHash: hashPassword(input.password) } : {}),
    };
    let user;
    if (input.id) {
      user = await prisma.user.update({ where: { id: input.id }, data });
    } else {
      // New users set their own password via an emailed 7-day link
      const inviteToken = randomBytes(24).toString("hex");
      user = await prisma.user.create({
        data: {
          ...data,
          locations: { connect: input.role === "OPERATOR" ? input.locationIds.map((id) => ({ id })) : [] },
          inviteToken,
          inviteExpiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
        },
      });
      const invite = userInviteEmail({
        name: user.name,
        role: user.role,
        setupUrl: `${baseUrl()}/setup/${inviteToken}`,
        invitedBy: session.user.name,
      });
      await sendEmail({ to: email, ...invite });
    }
    await audit(session, input.id ? "user.update" : "user.create", "User", user.id, `${email} (${input.role})`);
    revalidatePath("/users");
    return { ok: true, id: user.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unexpected error" };
  }
}

export async function resendInvite(userId: number): Promise<ActionResult> {
  try {
    const session = await requireRole("SUPERADMIN");
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return { ok: false, error: "User not found" };
    if (user.passwordHash) return { ok: false, error: "This user already set a password" };
    const inviteToken = randomBytes(24).toString("hex");
    await prisma.user.update({
      where: { id: userId },
      data: { inviteToken, inviteExpiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000) },
    });
    const invite = userInviteEmail({
      name: user.name,
      role: user.role,
      setupUrl: `${baseUrl()}/setup/${inviteToken}`,
      invitedBy: session.user.name,
    });
    const sent = await sendEmail({ to: user.email, ...invite });
    await audit(session, "user.invite.resend", "User", userId, user.email);
    revalidatePath("/users");
    return sent.sent
      ? { ok: true, id: userId }
      : { ok: false, error: `Invite refreshed but the email did not send (${sent.error}) — link: ${baseUrl()}/setup/${inviteToken}` };
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
