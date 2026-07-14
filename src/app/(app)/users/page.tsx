import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import UsersClient from "./UsersClient";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const session = (await getSession())!;
  if (session.user.role !== "SUPERADMIN") redirect("/dashboard");

  const [users, locations] = await Promise.all([
    prisma.user.findMany({ include: { location: true }, orderBy: [{ role: "asc" }, { name: "asc" }] }),
    prisma.location.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <UsersClient
      currentUserId={session.user.id}
      locations={locations}
      users={users.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        locationId: u.locationId,
        locationName: u.location?.name ?? null,
        active: u.active,
        invitePending: u.passwordHash === null,
      }))}
    />
  );
}
