"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { logoutAction, setCurrencyAction, setLangAction, setThemeAction } from "@/app/actions/session";

export default function HeaderControls({
  lang,
  showEur,
  dark,
}: {
  lang: "en" | "pl";
  showEur: boolean;
  dark: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const toggle = (fn: () => Promise<void>) =>
    startTransition(async () => {
      await fn();
      router.refresh();
    });

  const chip = "px-2.5 py-1.5 rounded-lg border border-line bg-card text-mut hover:bg-hovr hover:text-ink text-sm";

  return (
    <div className="flex items-center gap-2 text-sm">
      <button onClick={() => toggle(() => setLangAction(lang === "en" ? "pl" : "en"))} className={chip} title="Language">
        {lang.toUpperCase()}
      </button>
      <button
        onClick={() => toggle(() => setCurrencyAction(!showEur))}
        className={showEur ? "px-2.5 py-1.5 rounded-lg bg-acc text-white text-sm" : chip}
        title="Show approximate EUR next to PLN"
      >
        zł{showEur ? "+€" : ""}
      </button>
      <button
        onClick={() => toggle(() => setThemeAction(dark ? "light" : "dark"))}
        className={chip}
        title={dark ? "Switch to light mode" : "Switch to dark mode"}
      >
        {dark ? (
          <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z" />
          </svg>
        )}
      </button>
      <form action={logoutAction}>
        <button className={chip}>Log out</button>
      </form>
    </div>
  );
}
