import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession, atLeast } from "@/lib/auth";
import InboxClient from "./InboxClient";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const session = (await getSession())!;
  if (!atLeast(session.user.role, "ADMIN")) redirect("/dashboard");

  const items = await prisma.inboxItem.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      reservation: {
        include: { room: { include: { location: true } } },
      },
    },
  });

  return (
    <InboxClient
      items={items.map((i) => ({
        id: i.id,
        type: i.type,
        title: i.title,
        body: i.body,
        unread: i.readAt === null,
        createdAt: i.createdAt.toISOString().slice(0, 16).replace("T", " "),
        calendarHref: i.reservation
          ? `/calendar?loc=${i.reservation.room.location.slug}&view=week&anchor=${i.reservation.checkIn.toISOString().slice(0, 10)}`
          : null,
      }))}
    />
  );
}
