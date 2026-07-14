"use server";

import { prisma } from "@/lib/db";
import { getSession, hashPassword, verifyPassword } from "@/lib/auth";
import { audit } from "@/lib/audit";
import type { ActionResult } from "./reservations";

/** Any signed-in user changes their own password (current one required). */
export async function changeOwnPassword(
  current: string,
  next: string,
  confirm: string
): Promise<ActionResult> {
  try {
    const session = await getSession();
    if (!session) return { ok: false, error: "Not signed in" };
    if (session.impersonator) return { ok: false, error: "Exit impersonation to change this user's password" };
    if (next !== confirm) return { ok: false, error: "New passwords don't match" };
    if (next.length < 8) return { ok: false, error: "At least 8 characters" };
    if (!/[a-zA-Z]/.test(next) || !/\d/.test(next)) return { ok: false, error: "Use letters and at least one number" };
    if (!verifyPassword(current, session.user.passwordHash)) {
      return { ok: false, error: "Current password is wrong" };
    }
    await prisma.user.update({
      where: { id: session.user.id },
      data: { passwordHash: hashPassword(next) },
    });
    await audit(session, "user.password.change", "User", session.user.id, "self-service");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unexpected error" };
  }
}
