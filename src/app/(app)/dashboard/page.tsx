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
      <h1 className="text-xl font-semibold">Dashboard</h1>

      {/* Stat tiles */}
      <div className="rounded-2xl border border-line bg-card grid grid-cols-2 lg:grid-cols-4 divide-x divide-line overflow-hidden">
        {locations.map((loc) => {
          const total = loc.rooms.length;
          const occupied = loc.rooms.filter((r) => r.reservations.length > 0).length;
          const pct = total > 0 ? Math.round((occupied / total) * 100) : null;
          return (
            <div key={loc.id} className="p-5">
              <div className="label-mono mb-2">{loc.name}</div>
              <div className="text-3xl font-semibold">
                {total === 0 ? <span className="text-faint text-base">no rooms</span> : `${occupied}/${total}`}
              </div>
              <div className="text-xs text-mut mt-1">
                {pct !== null ? `${pct}% · ${t(lang, "occupancy_today")}` : "add rooms in Locations"}
              </div>
              {pct !== null && (
                <div className="mt-3 h-1.5 rounded-full bg-hovr overflow-hidden">
                  <div className="h-full bg-acc rounded-full" style={{ width: `${pct}%` }} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card index="01" title={`${t(lang, "arrivals_today")} · ${arrivals.length}`}>
          {arrivals.length === 0 && <Empty text="No arrivals today" />}
          {arrivals.map((r) => (
            <Row key={r.id} main={who(r)} sub={`${r.room.location.name} · ${r.room.name} · from ${r.checkInTime}`} />
          ))}
        </Card>
        <Card index="02" title={`${t(lang, "departures_today")} · ${departures.length}`}>
          {departures.length === 0 && <Empty text="No departures today" />}
          {departures.map((r) => (
            <Row key={r.id} main={who(r)} sub={`${r.room.location.name} · ${r.room.name} · by ${r.checkOutTime}`} />
          ))}
        </Card>
        <Card index="03" title={`${t(lang, "standby_due")} · ${standby.length}`} accent={standby.length > 0}>
          {standby.length === 0 && <Empty text="Nothing to resolve" />}
          {standby.map((r) => (
            <Row
              key={r.id}
              main={who(r)}
              sub={`${r.room.location.name} · ${r.room.name} · check-in ${ymd(r.checkIn)}`}
            />
          ))}
          {standby.length > 0 && (
            <p className="text-xs text-mut mt-2">
              Standby guests with check-in within 7 days need a decision — confirm or send to the partner hotel in
              the{" "}
              <Link href="/calendar" className="text-acc underline">
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

function Card({
  index,
  title,
  children,
  accent,
}: {
  index: string;
  title: string;
  children: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div className={`rounded-2xl bg-card border p-4 ${accent ? "border-warn" : "border-line"}`}>
      <h2 className="text-sm font-medium mb-3">
        <span className="label-mono mr-2">{index}</span>
        {title}
      </h2>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Row({ main, sub }: { main: string; sub: string }) {
  return (
    <div className="rounded-lg bg-hovr px-3 py-2">
      <div className="text-sm font-medium">{main}</div>
      <div className="text-xs text-mut font-mono">{sub}</div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="text-sm text-faint font-mono">{text}</div>;
}
