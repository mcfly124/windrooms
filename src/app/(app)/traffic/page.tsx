import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession, atLeast } from "@/lib/auth";
import { addDays, parseYmd, todayYmd, ymd } from "@/lib/dates";
import TrafficClient from "./TrafficClient";

export const dynamic = "force-dynamic";

const RANGES = [7, 30, 90] as const;
type Row = { key: string | null; views: bigint; visitors: bigint };

function rows(r: Row[]): { key: string; views: number; visitors: number }[] {
  return r.map((x) => ({ key: x.key ?? "unknown", views: Number(x.views), visitors: Number(x.visitors) }));
}

export default async function TrafficPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const session = (await getSession())!;
  if (!atLeast(session.user.role, "ADMIN")) redirect("/dashboard");

  const sp = await searchParams;
  const days = RANGES.includes(Number(sp.days) as (typeof RANGES)[number]) ? Number(sp.days) : 30;

  // Window is [start, today] inclusive; the previous window of equal length
  // sits directly before it, for the change indicators.
  const today = todayYmd();
  const start = addDays(today, -(days - 1));
  const prevStart = addDays(start, -days);
  const startD = parseYmd(start);
  const prevStartD = parseYmd(prevStart);

  const [daily, sources, links, pages, devices, countries, totals, prevTotals, bookings] = await Promise.all([
    prisma.$queryRaw<{ key: Date; views: bigint; visitors: bigint }[]>`
      SELECT date AS key, COUNT(*) AS views, COUNT(DISTINCT visitor) AS visitors
      FROM "PageView" WHERE date >= ${startD}
      GROUP BY date ORDER BY date ASC`,
    prisma.$queryRaw<(Row & { medium: string | null })[]>`
      SELECT source AS key, MIN(medium) AS medium, COUNT(*) AS views, COUNT(DISTINCT visitor) AS visitors
      FROM "PageView" WHERE date >= ${startD}
      GROUP BY source ORDER BY views DESC LIMIT 20`,
    // The exact URLs behind each source — a blog post or a specific profile
    // link is worth seeing whole, not collapsed into its host.
    prisma.$queryRaw<(Row & { source: string })[]>`
      SELECT source, referrer AS key, COUNT(*) AS views, COUNT(DISTINCT visitor) AS visitors
      FROM "PageView" WHERE date >= ${startD} AND referrer IS NOT NULL
      GROUP BY source, referrer ORDER BY views DESC LIMIT 150`,
    prisma.$queryRaw<Row[]>`
      SELECT path AS key, COUNT(*) AS views, COUNT(DISTINCT visitor) AS visitors
      FROM "PageView" WHERE date >= ${startD}
      GROUP BY path ORDER BY views DESC LIMIT 12`,
    prisma.$queryRaw<Row[]>`
      SELECT device AS key, COUNT(*) AS views, COUNT(DISTINCT visitor) AS visitors
      FROM "PageView" WHERE date >= ${startD}
      GROUP BY device ORDER BY views DESC`,
    prisma.$queryRaw<Row[]>`
      SELECT country AS key, COUNT(*) AS views, COUNT(DISTINCT visitor) AS visitors
      FROM "PageView" WHERE date >= ${startD} AND country IS NOT NULL
      GROUP BY country ORDER BY views DESC LIMIT 8`,
    prisma.$queryRaw<{ views: bigint; visitors: bigint }[]>`
      SELECT COUNT(*) AS views, COUNT(DISTINCT visitor) AS visitors
      FROM "PageView" WHERE date >= ${startD}`,
    prisma.$queryRaw<{ views: bigint; visitors: bigint }[]>`
      SELECT COUNT(*) AS views, COUNT(DISTINCT visitor) AS visitors
      FROM "PageView" WHERE date >= ${prevStartD} AND date < ${startD}`,
    prisma.reservation.count({
      where: { source: "PUBLIC", status: { not: "CANCELLED" }, createdAt: { gte: startD } },
    }),
  ]);

  // Zero-fill the chart so quiet days show as gaps in the line, not skips
  const byDay = new Map(daily.map((d) => [ymd(d.key), d]));
  const labels: string[] = [];
  const views: number[] = [];
  const visitors: number[] = [];
  for (let i = 0; i < days; i++) {
    const d = addDays(start, i);
    labels.push(d);
    views.push(Number(byDay.get(d)?.views ?? 0));
    visitors.push(Number(byDay.get(d)?.visitors ?? 0));
  }

  const t = totals[0];
  const p = prevTotals[0];
  const totalVisitors = Number(t?.visitors ?? 0);

  return (
    <TrafficClient
      days={days}
      ranges={[...RANGES]}
      labels={labels}
      views={views}
      visitors={visitors}
      sources={rows(sources).map((r, i) => ({
        ...r,
        medium: sources[i].medium,
        links: rows(links.filter((l) => l.source === sources[i].key)),
      }))}
      pages={rows(pages)}
      devices={rows(devices)}
      countries={rows(countries)}
      tiles={{
        views: Number(t?.views ?? 0),
        visitors: totalVisitors,
        prevViews: Number(p?.views ?? 0),
        prevVisitors: Number(p?.visitors ?? 0),
        bookings,
        conversionPct: totalVisitors > 0 ? Math.round((bookings / totalVisitors) * 1000) / 10 : 0,
      }}
    />
  );
}
