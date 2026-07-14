"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addCreditGrant } from "@/app/actions/clients";

export default function GrantForm({
  clientId,
  locations,
}: {
  clientId: number;
  locations: { id: number; name: string }[];
}) {
  const router = useRouter();
  const [nights, setNights] = useState(10);
  const [scope, setScope] = useState<string>("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await addCreditGrant({
        clientId,
        nights,
        scopeLocationId: scope ? Number(scope) : null,
        note,
      });
      if (result.ok) {
        setNote("");
        router.refresh();
      } else setError(result.error);
    });
  }

  const input = "rounded-lg bg-hovr border border-line px-2.5 py-1.5 text-sm text-ink outline-none focus:border-acc";

  return (
    <div className="rounded-2xl bg-card border border-line p-4">
      <h2 className="text-sm font-medium text-mut mb-3">Add night credits (manual package entry)</h2>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs text-mut mb-1">Nights (negative = correction)</label>
          <input type="number" className={`${input} w-24`} value={nights} onChange={(e) => setNights(Number(e.target.value))} />
        </div>
        <div>
          <label className="block text-xs text-mut mb-1">Valid at</label>
          <select className={input} value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="">All locations</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-48">
          <label className="block text-xs text-mut mb-1">Note (e.g. “10H package Gdansk”)</label>
          <input className={`${input} w-full`} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <button onClick={submit} disabled={pending} className="rounded-lg bg-ok hover:opacity-90 disabled:opacity-50 text-white px-4 py-1.5 text-sm font-medium">
          Add
        </button>
      </div>
      {error && <p className="text-sm text-bad mt-2">{error}</p>}
    </div>
  );
}
