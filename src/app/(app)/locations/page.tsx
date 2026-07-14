import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import LocationsClient from "./LocationsClient";

export const dynamic = "force-dynamic";

export default async function LocationsPage() {
  const session = (await getSession())!;
  if (session.user.role !== "SUPERADMIN") redirect("/dashboard");

  const locations = await prisma.location.findMany({
    include: { rooms: { orderBy: { name: "asc" } } },
    orderBy: { name: "asc" },
  });

  return (
    <LocationsClient
      locations={locations.map((l) => ({
        id: l.id,
        name: l.name,
        slug: l.slug,
        active: l.active,
        publicBookingEnabled: l.publicBookingEnabled,
        releaseWindowDays: l.releaseWindowDays,
        hotelPartnerInfo: l.hotelPartnerInfo,
        publicDescription: l.publicDescription,
        notes: l.notes,
        rooms: l.rooms.map((r) => ({ id: r.id, name: r.name, type: r.type, active: r.active, pricePln: r.pricePln ? Number(r.pricePln) : null })),
      }))}
    />
  );
}
