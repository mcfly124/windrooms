import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { cache } from "react";
import { prisma } from "./db";
import type { Role, User } from "@prisma/client";

const COOKIE_NAME = "wr_session";
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set");
  return s;
}

// ---- passwords (scrypt, no native deps) ----

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string | null): boolean {
  if (!stored) return false;
  const [scheme, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

// ---- session cookie: userId.impersonatorId.issuedMs.hmac ----

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("hex");
}

export function makeSessionValue(userId: number, impersonatorId = 0): string {
  const payload = `${userId}.${impersonatorId}.${Date.now()}`;
  return `${payload}.${sign(payload)}`;
}

export async function setSessionCookie(userId: number, impersonatorId = 0) {
  const jar = await cookies();
  jar.set(COOKIE_NAME, makeSessionValue(userId, impersonatorId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: MAX_AGE_MS / 1000,
    path: "/",
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
}

export type SessionUser = User & { locations: { id: number }[] };

export type Session = {
  user: SessionUser;
  /** Set when a superadmin is impersonating `user` */
  impersonator: User | null;
};

/** Location ids an operator may access; null = all (admins & superadmin). */
export function allowedLocationIds(user: SessionUser): number[] | null {
  if (user.role !== "OPERATOR") return null;
  return user.locations.map((l) => l.id);
}

export const getSession = cache(async (): Promise<Session | null> => {
  const jar = await cookies();
  const raw = jar.get(COOKIE_NAME)?.value;
  if (!raw) return null;
  const parts = raw.split(".");
  if (parts.length !== 4) return null;
  const [uid, iid, issued, mac] = parts;
  const payload = `${uid}.${iid}.${issued}`;
  const expected = sign(payload);
  const macBuf = Buffer.from(mac);
  const expBuf = Buffer.from(expected);
  if (macBuf.length !== expBuf.length || !timingSafeEqual(macBuf, expBuf)) return null;
  if (Date.now() - Number(issued) > MAX_AGE_MS) return null;

  const user = await prisma.user.findUnique({
    where: { id: Number(uid) },
    include: { locations: { select: { id: true } } },
  });
  if (!user || !user.active) return null;

  let impersonator: User | null = null;
  const impersonatorId = Number(iid);
  if (impersonatorId > 0) {
    impersonator = await prisma.user.findUnique({ where: { id: impersonatorId } });
    if (!impersonator || !impersonator.active || impersonator.role !== "SUPERADMIN") return null;
  }
  return { user, impersonator };
});

/** Throws if there is no session or the role is not allowed. Use inside server actions. */
export async function requireRole(...roles: Role[]): Promise<Session> {
  const session = await getSession();
  if (!session) throw new Error("Not authenticated");
  if (roles.length > 0 && !roles.includes(session.user.role)) throw new Error("Not authorized");
  return session;
}

export const ROLE_RANK: Record<Role, number> = { OPERATOR: 0, ADMIN: 1, SUPERADMIN: 2 };

export function atLeast(role: Role, min: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[min];
}
