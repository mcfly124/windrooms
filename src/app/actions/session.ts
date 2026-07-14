"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import {
  clearSessionCookie,
  getSession,
  requireRole,
  setSessionCookie,
  verifyPassword,
} from "@/lib/auth";
import { audit } from "@/lib/audit";

export async function loginAction(_prev: { error?: string } | null, formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.active || !verifyPassword(password, user.passwordHash)) {
    return { error: "Invalid email or password" };
  }
  await setSessionCookie(user.id);
  redirect("/dashboard");
}

export async function logoutAction() {
  await clearSessionCookie();
  redirect("/login");
}

export async function setLangAction(lang: string) {
  const jar = await cookies();
  jar.set("wr_lang", lang === "pl" ? "pl" : "en", { maxAge: 365 * 24 * 3600, path: "/" });
}

export async function setCurrencyAction(showEur: boolean) {
  const jar = await cookies();
  jar.set("wr_eur", showEur ? "1" : "0", { maxAge: 365 * 24 * 3600, path: "/" });
}

export async function impersonateAction(targetUserId: number) {
  const session = await requireRole("SUPERADMIN");
  if (session.impersonator) throw new Error("Already impersonating");
  const target = await prisma.user.findUnique({ where: { id: targetUserId } });
  if (!target || !target.active) throw new Error("User not found");
  if (target.id === session.user.id) throw new Error("Cannot impersonate yourself");
  await audit(session, "user.impersonate", "User", target.id, `Started impersonating ${target.email}`);
  await setSessionCookie(target.id, session.user.id);
  redirect("/dashboard");
}

export async function stopImpersonationAction() {
  const session = await getSession();
  if (!session?.impersonator) throw new Error("Not impersonating");
  await setSessionCookie(session.impersonator.id);
  redirect("/users");
}
