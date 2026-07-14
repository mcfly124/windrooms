import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";
import { getSession, atLeast } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { normalizeLang, t } from "@/lib/i18n";
import HeaderControls from "./HeaderControls";
import SidebarNav from "./SidebarNav";
import QuickBook from "./QuickBook";
import Shell from "./Shell";
import { stopImpersonationAction } from "@/app/actions/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  const jar = await cookies();
  const lang = normalizeLang(jar.get("wr_lang")?.value);
  const showEur = jar.get("wr_eur")?.value === "1";
  const dark = jar.get("wr_theme")?.value === "dark";
  const { user, impersonator } = session;

  const sections: { label: string; items: { href: string; label: string; icon: string; badge?: number }[] }[] = [
    {
      label: "Operations",
      items: [
        { href: "/dashboard", label: t(lang, "dashboard"), icon: "grid" },
        { href: "/calendar", label: t(lang, "calendar"), icon: "calendar" },
        { href: "/clients", label: t(lang, "clients"), icon: "users" },
        { href: "/payments", label: t(lang, "payments"), icon: "card" },
      ],
    },
  ];
  if (atLeast(user.role, "ADMIN")) {
    const unread = await prisma.inboxItem.count({ where: { readAt: null } });
    sections[0].items.splice(2, 0, { href: "/planner", label: "Planner", icon: "layers" });
    sections[0].items.push({ href: "/inbox", label: "Inbox", icon: "mail", badge: unread });
    sections.push({
      label: "Insights",
      items: [{ href: "/stats", label: "Statistics", icon: "chart" }],
    });
    sections.push({
      label: "Admin",
      items: [
        { href: "/cleaning", label: t(lang, "cleaning"), icon: "spark" },
        { href: "/activity", label: t(lang, "activity"), icon: "list" },
        ...(user.role === "SUPERADMIN"
          ? [
              { href: "/locations", label: t(lang, "locations"), icon: "pin" },
              { href: "/users", label: t(lang, "users"), icon: "shield" },
            ]
          : []),
      ],
    });
  }

  const canBook = atLeast(user.role, "ADMIN");
  const [qbClients, qbLocations] = canBook
    ? await Promise.all([
        prisma.client.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, email: true } }),
        prisma.location.findMany({
          where: { active: true },
          orderBy: { name: "asc" },
          select: {
            id: true,
            name: true,
            rooms: {
              where: { active: true },
              orderBy: { name: "asc" },
              select: { id: true, name: true, type: true, pricePln: true },
            },
          },
        }),
      ])
    : [[], []];

  // Header clock follows Warsaw, like all business dates
  const warsawToday = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Warsaw" });
  const now = new Date(`${warsawToday}T00:00:00Z`);
  const week = Math.ceil(
    ((now.getTime() - Date.UTC(now.getUTCFullYear(), 0, 1)) / 86400000 + new Date(Date.UTC(now.getUTCFullYear(), 0, 1)).getUTCDay() + 1) / 7
  );
  const dateLine = `${now.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" }).toUpperCase()} ${now.getUTCFullYear()} · WK ${week} · ${now
    .toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", timeZone: "UTC" })
    .toUpperCase()}`;

  const sidebar = (
    <>
      <div className="flex items-center gap-3 px-5 h-16 shrink-0">
        <div className="w-9 h-9 rounded-xl bg-acc text-white flex items-center justify-center font-semibold text-sm">
          FR
        </div>
        <div>
          <div className="text-sm font-semibold leading-tight">Flyspot</div>
          <div className="label-mono">Rooms ops</div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-5">
        {sections.map((s) => (
          <div key={s.label}>
            <div className="label-mono px-2 mb-1.5">{s.label}</div>
            <SidebarNav items={s.items} />
          </div>
        ))}
      </div>
      <Link
        href="/account"
        className="border-t border-line px-5 py-4 flex items-center gap-3 hover:bg-hovr shrink-0"
        title="Account settings"
      >
        <div className="w-8 h-8 rounded-full bg-purp-soft text-purp flex items-center justify-center text-xs font-semibold">
          {user.name
            .split(" ")
            .map((w) => w[0])
            .slice(0, 2)
            .join("")
            .toUpperCase()}
        </div>
        <div className="min-w-0">
          <div className="text-sm font-medium truncate">{user.name}</div>
          <div className="text-xs text-mut">{user.role.toLowerCase()}</div>
        </div>
      </Link>
    </>
  );

  const header = (
    <>
      <span className="label-mono hidden md:inline whitespace-nowrap">{dateLine}</span>
      <div className="ml-auto flex items-center gap-1.5 lg:gap-2 min-w-0">
        {canBook && (
          <QuickBook
            clients={qbClients}
            locations={qbLocations.map((l) => ({
              id: l.id,
              name: l.name,
              rooms: l.rooms.map((r) => ({
                id: r.id,
                name: r.name,
                type: r.type,
                pricePln: r.pricePln ? Number(r.pricePln) : null,
              })),
            }))}
          />
        )}
        <HeaderControls lang={lang} showEur={showEur} dark={dark} />
      </div>
    </>
  );

  const banner = impersonator ? (
    <div className="bg-warn-soft text-warn text-sm px-4 lg:px-6 py-1.5 flex items-center justify-between border-b border-line">
      <span>
        {t(lang, "viewing_as")} <b>{user.name}</b> ({user.role.toLowerCase()})
      </span>
      <form action={stopImpersonationAction}>
        <button className="underline font-medium">{t(lang, "exit_impersonation")}</button>
      </form>
    </div>
  ) : undefined;

  return (
    <Shell sidebar={sidebar} header={header} banner={banner}>
      {children}
    </Shell>
  );
}
