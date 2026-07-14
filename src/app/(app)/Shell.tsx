"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

/** Responsive app frame: fixed sidebar on desktop, hamburger drawer on mobile. */
export default function Shell({
  sidebar,
  header,
  banner,
  children,
}: {
  sidebar: React.ReactNode;
  header: React.ReactNode;
  banner?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Navigating closes the drawer
  useEffect(() => setOpen(false), [pathname]);

  // No body scroll behind the drawer
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <div className="min-h-screen bg-bg text-ink lg:flex">
      <aside className="hidden lg:flex w-60 shrink-0 bg-card border-r border-line flex-col sticky top-0 h-screen">
        {sidebar}
      </aside>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-72 max-w-[85vw] bg-card border-r border-line flex flex-col shadow-2xl">
            <button
              onClick={() => setOpen(false)}
              className="absolute top-4 right-3 text-faint hover:text-ink p-1"
              aria-label="Close menu"
            >
              <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        {banner}
        <header className="h-14 lg:h-16 border-b border-line bg-card flex items-center gap-2 lg:gap-4 px-3 lg:px-6 sticky top-0 z-40">
          <button
            onClick={() => setOpen(true)}
            className="lg:hidden p-2 -ml-1 rounded-lg text-mut hover:bg-hovr hover:text-ink"
            aria-label="Open menu"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M3 6h18M3 12h18M3 18h18" />
            </svg>
          </button>
          {header}
        </header>
        <main className="flex-1 p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
