import Link from "next/link";

export const metadata = { title: "Flyspot Rooms Gdańsk — Book a room" };

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-bg text-ink flex flex-col">
      <header className="border-b border-line bg-card">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-acc text-white flex items-center justify-center font-semibold text-sm">FR</div>
          <div>
            <Link href="/book" className="text-sm font-semibold leading-tight">Flyspot Rooms</Link>
            <div className="label-mono">Gdańsk · by the wind tunnel</div>
          </div>
          <div className="ml-auto flex items-center gap-4">
            <span className="label-mono hidden sm:block">Self check-in · 5 min from GDN airport</span>
            <Link href="/book/manage" className="text-sm text-mut hover:text-ink whitespace-nowrap">Manage booking</Link>
          </div>
        </div>
      </header>
      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-8">{children}</main>
      <footer className="border-t border-line py-6">
        <div className="max-w-4xl mx-auto px-4 text-xs text-faint flex flex-wrap gap-4">
          <span>Flyspot Gdańsk</span>
          <span>Check-in from 15:00 · check-out by 11:00</span>
          <span className="ml-auto">Payments in PLN</span>
        </div>
      </footer>
    </div>
  );
}
