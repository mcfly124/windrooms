"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { logoutAction, setCurrencyAction, setLangAction } from "@/app/actions/session";

export default function HeaderControls({
  lang,
  showEur,
  userName,
  role,
}: {
  lang: "en" | "pl";
  showEur: boolean;
  userName: string;
  role: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const toggle = (fn: () => Promise<void>) =>
    startTransition(async () => {
      await fn();
      router.refresh();
    });

  return (
    <div className="flex items-center gap-2 text-sm">
      <button
        onClick={() => toggle(() => setLangAction(lang === "en" ? "pl" : "en"))}
        className="px-2 py-1 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
        title="Language"
      >
        {lang === "en" ? "EN" : "PL"}
      </button>
      <button
        onClick={() => toggle(() => setCurrencyAction(!showEur))}
        className={`px-2 py-1 rounded-md ${showEur ? "bg-sky-600 text-white" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"}`}
        title="Show approximate EUR next to PLN"
      >
        zł{showEur ? "+€" : ""}
      </button>
      <span className="hidden sm:inline text-zinc-400 px-2">
        {userName} <span className="text-zinc-600">· {role.toLowerCase()}</span>
      </span>
      <form action={logoutAction}>
        <button className="px-2 py-1 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-300">⏻</button>
      </form>
    </div>
  );
}
