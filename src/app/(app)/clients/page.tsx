import { prisma } from "@/lib/db";
import { getSession, atLeast } from "@/lib/auth";
import ClientsClient from "./ClientsClient";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const session = (await getSession())!;
  const [clients, sums, locations] = await Promise.all([
    prisma.client.findMany({ orderBy: { name: "asc" } }),
    prisma.creditEntry.groupBy({ by: ["clientId"], _sum: { nights: true } }),
    prisma.location.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const balance = new Map(sums.map((s) => [s.clientId, s._sum.nights ?? 0]));

  return (
    <ClientsClient
      canEdit={atLeast(session.user.role, "ADMIN")}
      locations={locations}
      clients={clients.map((c) => ({
        id: c.id,
        name: c.name,
        email: c.email,
        phone: c.phone,
        country: c.country,
        notes: c.notes,
        balance: balance.get(c.id) ?? 0,
      }))}
    />
  );
}
