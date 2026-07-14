import { prisma } from "@/lib/db";
import { getEurRate, fmtPln } from "@/lib/currency";
import { addDays, nightsBetween, todayYmd } from "@/lib/dates";
import { publicAvailableRooms, validStayDates } from "@/lib/booking";
import SearchForm from "./SearchForm";
import RoomCard from "./RoomCard";

export const dynamic = "force-dynamic";

export default async function PublicBookingPage({
  searchParams,
}: {
  searchParams: Promise<{ in?: string; out?: string }>;
}) {
  const params = await searchParams;
  const today = todayYmd();
  const checkIn = /^\d{4}-\d{2}-\d{2}$/.test(params.in ?? "") ? params.in! : today;
  const checkOut = /^\d{4}-\d{2}-\d{2}$/.test(params.out ?? "") ? params.out! : addDays(checkIn, 1);

  const location = await prisma.location.findUnique({ where: { slug: "gdansk" } });
  const enabled = location?.active && location.publicBookingEnabled;

  const dateError = validStayDates(checkIn, checkOut);
  const result = enabled && !dateError ? await publicAvailableRooms("gdansk", checkIn, checkOut) : null;
  const eurRate = await getEurRate();
  const nights = nightsBetween(checkIn, checkOut);

  return (
    <div className="space-y-8">
      <section className="text-center space-y-3 py-4">
        <h1 className="text-3xl font-semibold tracking-tight">Sleep next to the wind tunnel</h1>
        <p className="text-mut max-w-xl mx-auto">
          {location?.publicDescription ??
            "Simple, comfortable rooms right at Flyspot Gdańsk — five minutes from Gdańsk airport. Book online, check in by yourself with a door code, any time."}
        </p>
      </section>

      <SearchForm checkIn={checkIn} checkOut={checkOut} />

      {!enabled ? (
        <p className="text-center text-mut">Online booking is not open at the moment — please check back soon.</p>
      ) : dateError ? (
        <p className="text-center text-bad text-sm">{dateError}</p>
      ) : result && result.rooms.length === 0 ? (
        result.anyBlockedByWindow ? (
          <div className="text-center space-y-1">
            <p className="text-mut">
              Online bookings open <b className="text-ink">{location!.releaseWindowDays} days</b> before arrival.
            </p>
            <p className="text-sm text-faint">
              Your dates are further out — try dates up to {addDays(today, location!.releaseWindowDays)}.
            </p>
          </div>
        ) : (
          <p className="text-center text-mut">No rooms free for those dates — try shifting by a day or two.</p>
        )
      ) : result ? (
        <section className="space-y-3">
          <div className="label-mono">
            {result.rooms.length} room{result.rooms.length === 1 ? "" : "s"} free · {nights} night{nights === 1 ? "" : "s"}
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            {result.rooms.map((room) => (
              <RoomCard
                key={room.id}
                roomId={room.id}
                name={room.name}
                type={room.type}
                checkIn={checkIn}
                checkOut={checkOut}
                nightly={fmtPln(Number(room.pricePln), eurRate, true)}
                total={fmtPln(nights * Number(room.pricePln), eurRate, true)}
              />
            ))}
          </div>
        </section>
      ) : null}

      <section className="grid sm:grid-cols-3 gap-4 pt-4">
        <Perk title="Self check-in 24/7" body="You get a personal door code before arrival — no reception needed." />
        <Perk title="At the tunnel" body="Wake up, walk 30 seconds, fly. Or catch your early flight from GDN." />
        <Perk title="Fair prices in PLN" body="Pay online when you book. EUR shown for reference." />
      </section>
    </div>
  );
}

function Perk({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-line bg-card p-4">
      <div className="text-sm font-medium mb-1">{title}</div>
      <div className="text-sm text-mut">{body}</div>
    </div>
  );
}
