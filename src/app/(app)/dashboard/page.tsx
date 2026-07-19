import Link from "next/link";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { normalizeLang, t } from "@/lib/i18n";
import { getSession, allowedLocationIds } from "@/lib/auth";
import { addDays, parseYmd, todayYmd, ymd } from "@/lib/dates";
import { STANDBY_DECISION_DAYS, daysUntil } from "@/lib/standby";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = (await getSession())!;
  const allowed = allowedLocationIds(session.user);
  const locFilter = allowed ? { room: { locationId: { in: allowed } } } : {};
  const jar = await cookies();
  const lang = normalizeLang(jar.get("wr_lang")?.value);
  const today = todayYmd();

  const [arrivals, departures, standby, locations] = await Promise.all([
    prisma.reservation.findMany({
      where: { status: "CONFIRMED", checkIn: parseYmd(today), ...locFilter },
      include: { room: { include: { location: true } }, client: true },
      orderBy: { roomId: "asc" },
    }),
    prisma.reservation.findMany({
      where: { status: "CONFIRMED", checkOut: parseYmd(today), ...locFilter },
      include: { room: { include: { location: true } }, client: true },
      orderBy: { roomId: "asc" },
    }),
    // Two weeks out, plus anything already past its deadline — those are the
    // ones that must not quietly fall off the list.
    prisma.reservation.findMany({
      where: {
        status: "STANDBY",
        checkIn: { lte: parseYmd(addDays(today, 14)) },
        ...locFilter,
      },
      include: { room: { include: { location: true } }, client: true },
      orderBy: { checkIn: "asc" },
    }),
    prisma.location.findMany({
      where: { active: true, ...(allowed ? { id: { in: allowed } } : {}) },
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

  // Inside the decision window (or past it) = priority: red, and first in the
  // list whatever the check-in order says.
  const standbyRanked = standby
    .map((r) => {
      const days = daysUntil(today, ymd(r.checkIn));
      return { r, days, urgent: days <= STANDBY_DECISION_DAYS };
    })
    .sort((a, b) => Number(b.urgent) - Number(a.urgent) || a.days - b.days);
  const urgentCount = standbyRanked.filter((s) => s.urgent).length;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Dashboard</h1>

      {/* Stat tiles */}
      <div className="rounded-2xl border border-line bg-line grid grid-cols-2 lg:grid-cols-4 gap-px overflow-hidden">
        {locations.map((loc) => {
          const total = loc.rooms.length;
          const occupied = loc.rooms.filter((r) => r.reservations.length > 0).length;
          const pct = total > 0 ? Math.round((occupied / total) * 100) : null;
          return (
            <div key={loc.id} className="bg-card p-4 lg:p-5">
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
        <Card
          index="03"
          title={`${t(lang, "standby_due")} · ${standby.length}`}
          accent={standby.length > 0}
          urgent={urgentCount > 0}
        >
          {standby.length === 0 && <Empty text="Nothing to resolve" />}
          {urgentCount > 0 && (
            <div className="rounded-lg bg-bad-soft text-bad text-xs font-medium px-3 py-2">
              {urgentCount} need{urgentCount === 1 ? "s" : ""} a decision now
            </div>
          )}
          {standbyRanked.map(({ r, days, urgent }) => (
            <Row
              key={r.id}
              main={who(r)}
              sub={`${r.room.location.name} · ${r.room.name} · check-in ${ymd(r.checkIn)}`}
              tag={days < 0 ? "past due" : days === 0 ? "today" : `${days}d`}
              urgent={urgent}
            />
          ))}
          {standby.length > 0 && (
            <p className="text-xs text-mut mt-2">
              Standby guests inside {STANDBY_DECISION_DAYS} days of check-in need a decision — confirm or send to
              the partner hotel in the{" "}
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
  urgent,
}: {
  index: string;
  title: string;
  children: React.ReactNode;
  accent?: boolean;
  urgent?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl bg-card border p-4 ${urgent ? "border-bad" : accent ? "border-warn" : "border-line"}`}
    >
      <h2 className="text-sm font-medium mb-3">
        <span className="label-mono mr-2">{index}</span>
        {title}
      </h2>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Row({
  main,
  sub,
  tag,
  urgent,
}: {
  main: string;
  sub: string;
  tag?: string;
  urgent?: boolean;
}) {
  return (
    <div className={`rounded-lg px-3 py-2 ${urgent ? "bg-bad-soft" : "bg-hovr"}`}>
      <div className="flex items-center gap-2">
        <div className={`text-sm font-medium ${urgent ? "text-bad" : ""}`}>{main}</div>
        {tag && (
          <span
            className={`ml-auto label-mono px-1.5 py-0.5 rounded ${
              urgent ? "bg-bad text-white" : "bg-hovr text-mut"
            }`}
          >
            {tag}
          </span>
        )}
      </div>
      <div className={`text-xs font-mono ${urgent ? "text-bad" : "text-mut"}`}>{sub}</div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="text-sm text-faint font-mono">{text}</div>;
}
