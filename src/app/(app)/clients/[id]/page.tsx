import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession, atLeast } from "@/lib/auth";
import { ymd } from "@/lib/dates";
import GrantForm from "./GrantForm";

export const dynamic = "force-dynamic";

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: idStr } = await params;
  const id = Number(idStr);
  const session = (await getSession())!;
  const canEdit = atLeast(session.user.role, "ADMIN");

  const [client, locations] = await Promise.all([
    prisma.client.findUnique({
      where: { id },
      include: {
        creditEntries: { include: { scopeLocation: true, createdBy: true }, orderBy: { createdAt: "desc" } },
        reservations: {
          include: { room: { include: { location: true } } },
          orderBy: { checkIn: "desc" },
          take: 50,
        },
      },
    }),
    prisma.location.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  if (!client) notFound();

  // Balance per pool: global + one per location that has entries
  const pools = new Map<string, number>();
  for (const e of client.creditEntries) {
    const key = e.scopeLocation?.name ?? "All locations";
    pools.set(key, (pools.get(key) ?? 0) + e.nights);
  }
  const total = client.creditEntries.reduce((sum, e) => sum + e.nights, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4 flex-wrap">
        <div>
          <Link href="/clients" className="text-xs text-faint hover:text-mut">← Clients</Link>
          <h1 className="text-2xl font-semibold text-ink">{client.name}</h1>
          <p className="text-sm text-mut">
            {[client.email, client.phone, client.country].filter(Boolean).join(" · ") || "no contact info"}
          </p>
          {client.notes && <p className="text-sm text-faint mt-1">{client.notes}</p>}
        </div>
        <div className="ml-auto rounded-2xl bg-card border border-line px-5 py-3 text-right">
          <div className={`text-3xl font-semibold ${total > 0 ? "text-ok" : "text-faint"}`}>{total}</div>
          <div className="text-xs text-faint">nights total</div>
          <div className="text-xs text-mut mt-1 space-y-0.5">
            {[...pools.entries()].map(([name, n]) => (
              <div key={name}>{name}: <b className={n > 0 ? "text-ok" : "text-faint"}>{n}</b></div>
            ))}
          </div>
        </div>
      </div>

      {canEdit && <GrantForm clientId={client.id} locations={locations} />}

      <div className="grid lg:grid-cols-2 gap-4">
        <section className="rounded-2xl border border-line overflow-hidden">
          <h2 className="bg-card px-4 py-2.5 text-sm font-medium text-mut">Credit ledger</h2>
          <table className="w-full text-sm">
            <tbody>
              {client.creditEntries.map((e) => (
                <tr key={e.id} className="border-t border-line">
                  <td className={`px-4 py-2 font-medium ${e.nights > 0 ? "text-ok" : "text-bad"}`}>
                    {e.nights > 0 ? `+${e.nights}` : e.nights}
                  </td>
                  <td className="px-2 py-2 text-mut">{e.scopeLocation?.name ?? "All"}</td>
                  <td className="px-2 py-2 text-faint text-xs">
                    {e.note ?? (e.reservationId ? `Reservation #${e.reservationId}` : "")}
                  </td>
                  <td className="px-4 py-2 text-faint text-xs text-right whitespace-nowrap">
                    {e.createdAt.toISOString().slice(0, 10)}
                    {e.createdBy ? ` · ${e.createdBy.name}` : ""}
                  </td>
                </tr>
              ))}
              {client.creditEntries.length === 0 && (
                <tr><td className="px-4 py-6 text-center text-faint">No credits yet</td></tr>
              )}
            </tbody>
          </table>
        </section>

        <section className="rounded-2xl border border-line overflow-hidden">
          <h2 className="bg-card px-4 py-2.5 text-sm font-medium text-mut">Reservations</h2>
          <table className="w-full text-sm">
            <tbody>
              {client.reservations.map((r) => (
                <tr key={r.id} className="border-t border-line">
                  <td className="px-4 py-2 text-ink">{r.room.location.name} · {r.room.name}</td>
                  <td className="px-2 py-2 text-mut whitespace-nowrap">{ymd(r.checkIn)} → {ymd(r.checkOut)}</td>
                  <td className="px-4 py-2 text-right">
                    <StatusBadge status={r.status} />
                  </td>
                </tr>
              ))}
              {client.reservations.length === 0 && (
                <tr><td className="px-4 py-6 text-center text-faint">No reservations yet</td></tr>
              )}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    CONFIRMED: "bg-acc-soft text-acc",
    STANDBY: "bg-warn-soft text-warn",
    CANCELLED: "bg-hovr text-faint",
    HOTEL_OVERFLOW: "bg-purp-soft text-purp",
  };
  return <span className={`px-2 py-0.5 rounded text-xs ${styles[status] ?? ""}`}>{status.toLowerCase().replace("_", " ")}</span>;
}
