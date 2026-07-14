"use server";

import { prisma } from "@/lib/db";
import { hashPassword, setSessionCookie } from "@/lib/auth";
import type { ActionResult } from "./reservations";

function passwordProblem(password: string): string | null {
  if (password.length < 8) return "At least 8 characters";
  if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) return "Use letters and at least one number";
  return null;
}

/** Public: completes an invite — sets the password and signs the user in. */
export async function completeSetup(token: string, password: string, confirm: string): Promise<ActionResult> {
  try {
    if (password !== confirm) return { ok: false, error: "Passwords don't match" };
    const problem = passwordProblem(password);
    if (problem) return { ok: false, error: problem };

    const user = await prisma.user.findUnique({ where: { inviteToken: token } });
    if (!user || !user.active) return { ok: false, error: "This invite link is not valid" };
    if (user.inviteExpiresAt && user.inviteExpiresAt < new Date()) {
      return { ok: false, error: "This invite link expired — ask the superadmin to resend it" };
    }
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: hashPassword(password), inviteToken: null, inviteExpiresAt: null },
    });
    await setSessionCookie(user.id);
    return { ok: true, id: user.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unexpected error" };
  }
}
