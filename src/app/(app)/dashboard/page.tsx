import Link from "next/link";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { normalizeLang, t } from "@/lib/i18n";
import { addDays, parseYmd, todayYmd, ymd } from "@/lib/dates";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const jar = await cookies();
  const lang = normalizeLang(jar.get("wr_lang")?.value);
  const today = todayYmd();

  const [arrivals, departures, standby, locations] = await Promise.all([
    prisma.reservation.findMany({
      where: { status: "CONFIRMED", checkIn: parseYmd(today) },
      include: { room: { include: { location: true } }, client: true },
      orderBy: { roomId: "asc" },
    }),
    prisma.reservation.findMany({
      where: { status: "CONFIRMED", checkOut: parseYmd(today) },
      include: { room: { include: { location: true } }, client: true },
      orderBy: { roomId: "asc" },
    }),
    prisma.reservation.findMany({
      where: {
        status: "STANDBY",
        checkIn: { gte: parseYmd(today), lte: parseYmd(addDays(today, 7)) },
      },
      include: { room: { include: { location: true } }, client: true },
      orderBy: { checkIn: "asc" },
    }),
    prisma.location.findMany({
      where: { active: true },
      include: {
        rooms: {
          where: { active: true },
          include: {
            reservations: {
              where: { status: "CONFIRMED", checkIn: { lte: parseYmd(today) }, checkOut: { gt: parseYmd(today) } },
            },
          },
        },
      },
      orderBy: { name: "asc" },
    }),
  ]);

  const who = (r: (typeof arrivals)[number]) => r.client?.name ?? r.guestName ?? "—";

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {locations.map((loc) => {
          const total = loc.rooms.length;
          const occupied = loc.rooms.filter((r) => r.reservations.length > 0).length;
          return (
            <div key={loc.id} className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4">
              <div className="text-sm text-zinc-400">{loc.name}</div>
              <div className="text-2xl font-semibold text-white mt-1">
                {total === 0 ? <span className="text-zinc-600 text-base">no rooms yet</span> : `${occupied}/${total}`}
              </div>
              <div className="text-xs text-zinc-500 mt-1">{t(lang, "occupancy_today")}</div>
            </div>
          );
        })}
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card title={`${t(lang, "arrivals_today")} (${arrivals.length})`}>
          {arrivals.length === 0 && <Empty />}
          {arrivals.map((r) => (
            <Row key={r.id} main={who(r)} sub={`${r.room.location.name} · ${r.room.name}`} />
          ))}
        </Card>
        <Card title={`${t(lang, "departures_today")} (${departures.length})`}>
          {departures.length === 0 && <Empty />}
          {departures.map((r) => (
            <Row key={r.id} main={who(r)} sub={`${r.room.location.name} · ${r.room.name}`} />
          ))}
        </Card>
        <Card title={`${t(lang, "standby_due")} (${standby.length})`} accent>
          {standby.length === 0 && <Empty />}
          {standby.map((r) => (
            <Row
              key={r.id}
              main={who(r)}
              sub={`${r.room.location.name} · ${r.room.name} · check-in ${ymd(r.checkIn)}`}
            />
          ))}
          {standby.length > 0 && (
            <p className="text-xs text-zinc-500 mt-2">
              Standby guests with check-in within 7 days need a decision — confirm or send to partner hotel in the{" "}
              <Link href="/calendar" className="text-sky-400 underline">
                calendar
              </Link>
              .
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}

function Card({ title, children, accent }: { title: string; children: React.ReactNode; accent?: boolean }) {
  return (
    <div className={`rounded-2xl bg-zinc-900 border p-4 ${accent ? "border-amber-600/60" : "border-zinc-800"}`}>
      <h2 className="text-sm font-medium text-zinc-300 mb-3">{title}</h2>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Row({ main, sub }: { main: string; sub: string }) {
  return (
    <div className="rounded-lg bg-zinc-800/60 px-3 py-2">
      <div className="text-sm text-white">{main}</div>
      <div className="text-xs text-zinc-400">{sub}</div>
    </div>
  );
}

function Empty() {
  return <div className="text-sm text-zinc-600">—</div>;
}
