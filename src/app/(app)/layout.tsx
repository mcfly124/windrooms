import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";
import { getSession, atLeast } from "@/lib/auth";
import { normalizeLang, t } from "@/lib/i18n";
import HeaderControls from "./HeaderControls";
import { stopImpersonationAction } from "@/app/actions/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  const jar = await cookies();
  const lang = normalizeLang(jar.get("wr_lang")?.value);
  const showEur = jar.get("wr_eur")?.value === "1";
  const { user, impersonator } = session;

  const nav: { href: string; label: string }[] = [
    { href: "/dashboard", label: t(lang, "dashboard") },
    { href: "/calendar", label: t(lang, "calendar") },
    { href: "/clients", label: t(lang, "clients") },
    { href: "/payments", label: t(lang, "payments") },
  ];
  if (atLeast(user.role, "ADMIN")) {
    nav.push({ href: "/cleaning", label: t(lang, "cleaning") });
    nav.push({ href: "/activity", label: t(lang, "activity") });
  }
  if (user.role === "SUPERADMIN") {
    nav.push({ href: "/locations", label: t(lang, "locations") });
    nav.push({ href: "/users", label: t(lang, "users") });
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {impersonator && (
        <div className="bg-amber-500 text-black text-sm px-4 py-1.5 flex items-center justify-between">
          <span>
            {t(lang, "viewing_as")} <b>{user.name}</b> ({user.role.toLowerCase()})
          </span>
          <form action={stopImpersonationAction}>
            <button className="underline font-medium">{t(lang, "exit_impersonation")}</button>
          </form>
        </div>
      )}
      <header className="border-b border-zinc-800 bg-zinc-900/70 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center gap-6">
          <Link href="/dashboard" className="font-semibold text-white whitespace-nowrap">
            Flyspot <span className="text-sky-400">Rooms</span>
          </Link>
          <nav className="flex items-center gap-1 overflow-x-auto text-sm">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="px-3 py-1.5 rounded-lg text-zinc-300 hover:text-white hover:bg-zinc-800 whitespace-nowrap"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto">
            <HeaderControls lang={lang} showEur={showEur} userName={user.name} role={user.role} />
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
